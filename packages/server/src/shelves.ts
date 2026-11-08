import { autoLabel, cellsOf, compareCells, normalizeLayout, type Layout } from '@bok/core';
import {
	containers,
	copies,
	editions,
	householdInvites,
	householdMembers,
	households,
	inventorySessions,
	locations,
	profiles,
	sections,
	works,
	type Db,
	type InventoryResult
} from '@bok/db';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Storage } from './storage.ts';

export class Forbidden extends Error {}
export class NotFound extends Error {}

export interface SectionNode {
	id: string;
	col: number;
	row: number;
	x: number;
	y: number;
	w: number;
	h: number;
	label: string;
	customLabel: string | null;
	count: number;
}
export interface ContainerNode {
	id: string;
	name: string;
	type: string;
	layout: Layout;
	sections: SectionNode[];
	count: number;
}
export interface LocationNode {
	id: string;
	name: string;
	containers: ContainerNode[];
	count: number;
}
export interface StorageTree {
	householdId: string;
	householdName: string;
	locations: LocationNode[];
	unsorted: number;
}

export interface CopyRow {
	copyId: string;
	editionId: string;
	workId: string;
	title: string;
	authors: string[];
	year: number | null;
	cover: string | null;
	sectionId: string | null;
	state: string;
}

export interface Place {
	sectionId: string;
	label: string;
	containerId: string;
	containerName: string;
	locationId: string;
	locationName: string;
}

const authorsSql = sql<string[]>`coalesce((select array_agg(a.name order by wa.position) from work_authors wa join authors a on a.id = wa.author_id where wa.work_id = ${works.id}), '{}')`;
const label = (s: { col: number; row: number; customLabel: string | null }) => s.customLabel || autoLabel(s.col, s.row);

export function createShelves(deps: { db: Db; storage: Storage }) {
	const { db, storage } = deps;
	const cover = (key: string | null, src: string | null) => (key ? storage.url(`${key}-s.webp`) : src);

	async function memberships(userId: string) {
		return db
			.select({ householdId: householdMembers.householdId, isDefault: householdMembers.isDefault, role: householdMembers.role, name: households.name })
			.from(householdMembers)
			.innerJoin(households, eq(households.id, householdMembers.householdId))
			.where(eq(householdMembers.userId, userId))
			.orderBy(sql`${householdMembers.isDefault} desc`, asc(householdMembers.createdAt));
	}

	async function activeHousehold(userId: string): Promise<string> {
		const m = (await memberships(userId))[0];
		if (!m) throw new NotFound('no household');
		return m.householdId;
	}

	async function assertMember(userId: string, householdId: string) {
		const m = await db.query.householdMembers.findFirst({
			where: and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)),
			columns: { role: true }
		});
		if (!m) throw new Forbidden();
		return m.role;
	}

	async function owned<T extends { householdId: string }>(userId: string, row: T | undefined): Promise<T> {
		if (!row) throw new NotFound();
		await assertMember(userId, row.householdId);
		return row;
	}

	const getLocation = async (userId: string, id: string) => owned(userId, await db.query.locations.findFirst({ where: eq(locations.id, id) }));
	const getContainer = async (userId: string, id: string) => owned(userId, await db.query.containers.findFirst({ where: eq(containers.id, id) }));
	const getSection = async (userId: string, id: string) => owned(userId, await db.query.sections.findFirst({ where: eq(sections.id, id) }));

	async function nextPosition(table: typeof locations | typeof containers, where: ReturnType<typeof eq>) {
		const [r] = await db.select({ p: sql<number>`coalesce(max(${table.position}), -1) + 1` }).from(table).where(where);
		return Number(r?.p ?? 0);
	}

	/** Swap position with the neighbour above/below. */
	async function reorder(table: typeof locations | typeof containers, scope: ReturnType<typeof eq>, id: string, dir: -1 | 1) {
		const rows = await db.select({ id: table.id }).from(table).where(scope).orderBy(asc(table.position), asc(table.createdAt));
		const i = rows.findIndex((r) => r.id === id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= rows.length) return;
		[rows[i], rows[j]] = [rows[j]!, rows[i]!];
		await db.transaction(async (tx) => {
			for (const [pos, r] of rows.entries()) await tx.update(table).set({ position: pos }).where(eq(table.id, r.id));
		});
	}

	async function syncSections(tx: Pick<Db, 'insert' | 'update' | 'delete' | 'select'>, container: { id: string; householdId: string }, layout: Layout) {
		const cells = cellsOf(layout);
		const existing = await tx.select().from(sections).where(eq(sections.containerId, container.id));
		const key = (c: { col: number; row: number }) => `${c.col}:${c.row}`;
		const byKey = new Map(existing.map((s) => [key(s), s]));
		for (const c of cells) {
			const s = byKey.get(key(c));
			if (s) await tx.update(sections).set({ x: c.x, y: c.y, w: c.w, h: c.h }).where(eq(sections.id, s.id));
			else await tx.insert(sections).values({ householdId: container.householdId, containerId: container.id, ...c });
		}
		const keep = new Set(cells.map(key));
		const gone = existing.filter((s) => !keep.has(key(s))).map((s) => s.id);
		if (gone.length) await tx.delete(sections).where(inArray(sections.id, gone));
	}

	async function copyRows(where: ReturnType<typeof sql>): Promise<CopyRow[]> {
		const rows = await db
			.select({
				copyId: copies.id,
				editionId: editions.id,
				workId: works.id,
				title: editions.title,
				authors: authorsSql,
				year: editions.publishedYear,
				coverKey: editions.coverKey,
				coverSourceUrl: editions.coverSourceUrl,
				sectionId: copies.sectionId,
				state: copies.state
			})
			.from(copies)
			.innerJoin(editions, eq(editions.id, copies.editionId))
			.innerJoin(works, eq(works.id, editions.workId))
			.where(where)
			.orderBy(asc(editions.title));
		return rows.map(({ coverKey, coverSourceUrl, ...r }) => ({ ...r, cover: cover(coverKey, coverSourceUrl) }));
	}

	const api = {
		memberships,
		activeHousehold,
		assertMember,

		async tree(userId: string, householdId?: string): Promise<StorageTree> {
			const hh = householdId ?? (await activeHousehold(userId));
			await assertMember(userId, hh);
			const [house, locs, conts, secs, counts, [unsorted]] = await Promise.all([
				db.query.households.findFirst({ where: eq(households.id, hh), columns: { name: true } }),
				db.select().from(locations).where(eq(locations.householdId, hh)).orderBy(asc(locations.position), asc(locations.createdAt)),
				db.select().from(containers).where(eq(containers.householdId, hh)).orderBy(asc(containers.position), asc(containers.createdAt)),
				db.select().from(sections).where(eq(sections.householdId, hh)),
				db
					.select({ sectionId: copies.sectionId, n: sql<number>`count(*)::int` })
					.from(copies)
					.where(and(eq(copies.householdId, hh), sql`${copies.sectionId} is not null`))
					.groupBy(copies.sectionId),
				db.select({ n: sql<number>`count(*)::int` }).from(copies).where(and(eq(copies.householdId, hh), isNull(copies.sectionId)))
			]);
			const countBy = new Map(counts.map((c) => [c.sectionId!, c.n]));
			const secsBy = new Map<string, SectionNode[]>();
			for (const s of secs.sort(compareCells)) {
				const list = secsBy.get(s.containerId) ?? [];
				list.push({ id: s.id, col: s.col, row: s.row, x: s.x, y: s.y, w: s.w, h: s.h, label: label(s), customLabel: s.customLabel, count: countBy.get(s.id) ?? 0 });
				secsBy.set(s.containerId, list);
			}
			return {
				householdId: hh,
				householdName: house?.name ?? '',
				unsorted: unsorted?.n ?? 0,
				locations: locs.map((l) => {
					const cs = conts
						.filter((c) => c.locationId === l.id)
						.map((c) => {
							const ss = secsBy.get(c.id) ?? [];
							return { id: c.id, name: c.name, type: c.type, layout: c.layout, sections: ss, count: ss.reduce((a, s) => a + s.count, 0) };
						});
					return { id: l.id, name: l.name, containers: cs, count: cs.reduce((a, c) => a + c.count, 0) };
				})
			};
		},

		// ── Rooms ──
		async createLocation(userId: string, name: string) {
			const householdId = await activeHousehold(userId);
			const position = await nextPosition(locations, eq(locations.householdId, householdId));
			const [row] = await db.insert(locations).values({ householdId, name, position }).returning({ id: locations.id });
			return row!.id;
		},
		async renameLocation(userId: string, id: string, name: string) {
			await getLocation(userId, id);
			await db.update(locations).set({ name }).where(eq(locations.id, id));
		},
		/** Books on its shelves become Unsorted (FK set null). */
		async deleteLocation(userId: string, id: string) {
			await getLocation(userId, id);
			await db.delete(locations).where(eq(locations.id, id));
		},
		async moveLocation(userId: string, id: string, dir: -1 | 1) {
			const l = await getLocation(userId, id);
			await reorder(locations, eq(locations.householdId, l.householdId), id, dir);
		},

		// ── Furniture ──
		async createContainer(userId: string, locationId: string, name: string, layoutInput: unknown) {
			const loc = await getLocation(userId, locationId);
			const layout = normalizeLayout(layoutInput);
			const position = await nextPosition(containers, eq(containers.locationId, locationId));
			return db.transaction(async (tx) => {
				const [c] = await tx
					.insert(containers)
					.values({ householdId: loc.householdId, locationId, name, layout, position })
					.returning({ id: containers.id, householdId: containers.householdId });
				await syncSections(tx, c!, layout);
				return c!.id;
			});
		},
		getContainer,
		async renameContainer(userId: string, id: string, name: string) {
			await getContainer(userId, id);
			await db.update(containers).set({ name }).where(eq(containers.id, id));
		},
		async deleteContainer(userId: string, id: string) {
			await getContainer(userId, id);
			await db.delete(containers).where(eq(containers.id, id));
		},
		async moveContainer(userId: string, id: string, dir: -1 | 1) {
			const c = await getContainer(userId, id);
			await reorder(containers, eq(containers.locationId, c.locationId), id, dir);
		},

		/**
		 * Save a new layout. Shelves that disappear and still hold books are reported unless the
		 * caller says where those books go (`orphansTo`: a section id, or null for Unsorted).
		 */
		async setLayout(userId: string, containerId: string, layoutInput: unknown, orphansTo?: string | null) {
			const c = await getContainer(userId, containerId);
			const layout = normalizeLayout(layoutInput);
			const keep = new Set(cellsOf(layout).map((x) => `${x.col}:${x.row}`));
			const current = await db.select().from(sections).where(eq(sections.containerId, containerId));
			const removed = current.filter((s) => !keep.has(`${s.col}:${s.row}`));
			if (removed.length) {
				const counts = await db
					.select({ sectionId: copies.sectionId, n: sql<number>`count(*)::int` })
					.from(copies)
					.where(inArray(copies.sectionId, removed.map((s) => s.id)))
					.groupBy(copies.sectionId);
				if (counts.length && orphansTo === undefined) {
					return {
						ok: false as const,
						orphans: counts.map((k) => {
							const s = removed.find((r) => r.id === k.sectionId)!;
							return { sectionId: s.id, label: label(s), count: k.n };
						})
					};
				}
				if (counts.length && orphansTo) {
					const target = await getSection(userId, orphansTo);
					if (target.householdId !== c.householdId) throw new Forbidden();
					if (removed.some((r) => r.id === orphansTo)) throw new Error('target shelf is being removed');
				}
			}
			await db.transaction(async (tx) => {
				if (removed.length) {
					await tx
						.update(copies)
						.set({ sectionId: orphansTo ?? null })
						.where(inArray(copies.sectionId, removed.map((s) => s.id)));
				}
				await tx.update(containers).set({ layout }).where(eq(containers.id, containerId));
				await syncSections(tx, c, layout);
			});
			return { ok: true as const };
		},

		async renameSection(userId: string, id: string, custom: string | null) {
			await getSection(userId, id);
			await db.update(sections).set({ customLabel: custom?.trim() || null }).where(eq(sections.id, id));
		},

		/** Full place of a section, for breadcrumbs. */
		async place(sectionId: string): Promise<Place | null> {
			const [r] = await db
				.select({
					sectionId: sections.id,
					col: sections.col,
					row: sections.row,
					customLabel: sections.customLabel,
					containerId: containers.id,
					containerName: containers.name,
					locationId: locations.id,
					locationName: locations.name
				})
				.from(sections)
				.innerJoin(containers, eq(containers.id, sections.containerId))
				.innerJoin(locations, eq(locations.id, containers.locationId))
				.where(eq(sections.id, sectionId));
			if (!r) return null;
			const { col, row, customLabel, ...rest } = r;
			return { ...rest, label: label({ col, row, customLabel }) };
		},

		async section(userId: string, sectionId: string) {
			const s = await getSection(userId, sectionId);
			const [place, container, books] = await Promise.all([
				api.place(sectionId),
				db.query.containers.findFirst({ where: eq(containers.id, s.containerId) }),
				copyRows(sql`${copies.sectionId} = ${sectionId}`)
			]);
			const secs = (await db.select().from(sections).where(eq(sections.containerId, s.containerId))).sort(compareCells);
			return {
				section: { id: s.id, label: label(s), customLabel: s.customLabel, householdId: s.householdId },
				place: place!,
				container: { id: container!.id, name: container!.name, layout: container!.layout, sections: secs.map((x) => ({ id: x.id, col: x.col, row: x.row, x: x.x, y: x.y, w: x.w, h: x.h, label: label(x) })) },
				books
			};
		},

		async unsorted(userId: string) {
			const hh = (await memberships(userId)).map((m) => m.householdId);
			if (!hh.length) return [];
			return copyRows(sql`${copies.householdId} in ${hh} and ${copies.sectionId} is null`);
		},

		/** Move copies (all in the user's households) to a section of the same household, or to Unsorted. */
		async moveCopies(userId: string, copyIds: string[], sectionId: string | null) {
			if (!copyIds.length) return 0;
			const rows = await db.select({ id: copies.id, householdId: copies.householdId }).from(copies).where(inArray(copies.id, copyIds));
			const hhs = [...new Set(rows.map((r) => r.householdId))];
			for (const h of hhs) await assertMember(userId, h);
			if (sectionId) {
				const s = await getSection(userId, sectionId);
				if (hhs.some((h) => h !== s.householdId)) throw new Forbidden();
			}
			const res = await db
				.update(copies)
				.set({ sectionId })
				.where(inArray(copies.id, rows.map((r) => r.id)))
				.returning({ id: copies.id });
			return res.length;
		},

		/** Places for many copies at once (book page, library list). */
		async places(copyIds: string[]): Promise<Map<string, Place>> {
			const out = new Map<string, Place>();
			if (!copyIds.length) return out;
			const rows = await db
				.select({
					copyId: copies.id,
					sectionId: sections.id,
					col: sections.col,
					row: sections.row,
					customLabel: sections.customLabel,
					containerId: containers.id,
					containerName: containers.name,
					locationId: locations.id,
					locationName: locations.name
				})
				.from(copies)
				.innerJoin(sections, eq(sections.id, copies.sectionId))
				.innerJoin(containers, eq(containers.id, sections.containerId))
				.innerJoin(locations, eq(locations.id, containers.locationId))
				.where(inArray(copies.id, copyIds));
			for (const { copyId, col, row, customLabel, ...r } of rows) out.set(copyId, { ...r, label: label({ col, row, customLabel }) });
			return out;
		},

		/** The user's copies of these works (any edition), with where they stand. */
		async copiesOfWorks(userId: string, workIds: string[]) {
			if (!workIds.length) return [];
			const hh = (await memberships(userId)).map((m) => m.householdId);
			if (!hh.length) return [];
			const rows = await db
				.select({ copyId: copies.id, editionId: copies.editionId, workId: editions.workId, sectionId: copies.sectionId, state: copies.state })
				.from(copies)
				.innerJoin(editions, eq(editions.id, copies.editionId))
				.where(and(inArray(editions.workId, workIds), inArray(copies.householdId, hh)))
				.orderBy(asc(copies.createdAt));
			const places = await api.places(rows.map((r) => r.copyId));
			return rows.map((r) => ({ ...r, place: places.get(r.copyId) ?? null }));
		},

		/** Layouts + sections of the given bookcases, for drawing "where is it" sketches. */
		async sketches(containerIds: string[]) {
			if (!containerIds.length) return new Map<string, { layout: Layout; sections: { id: string; x: number; y: number; w: number; h: number; label: string }[] }>();
			const [cs, ss] = await Promise.all([
				db.select({ id: containers.id, layout: containers.layout }).from(containers).where(inArray(containers.id, containerIds)),
				db.select().from(sections).where(inArray(sections.containerId, containerIds))
			]);
			return new Map(
				cs.map((c) => [
					c.id,
					{ layout: c.layout, sections: ss.filter((s) => s.containerId === c.id).map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, label: label(s) })) }
				])
			);
		},

		async saveInventory(userId: string, sectionId: string, startedAt: Date, result: InventoryResult) {
			const s = await getSection(userId, sectionId);
			const [row] = await db
				.insert(inventorySessions)
				.values({ householdId: s.householdId, sectionId, userId, startedAt, result })
				.returning({ id: inventorySessions.id });
			return row!.id;
		},

		async lastInventory(sectionId: string) {
			return db.query.inventorySessions.findFirst({
				where: eq(inventorySessions.sectionId, sectionId),
				orderBy: (t, { desc }) => [desc(t.finishedAt)]
			});
		},

		// ── Sharing ──
		async createInvite(userId: string, householdId?: string) {
			const hh = householdId ?? (await activeHousehold(userId));
			await assertMember(userId, hh);
			const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
			await db.insert(householdInvites).values({ token, householdId: hh, createdBy: userId, expiresAt: new Date(Date.now() + 7 * 86_400_000) });
			return token;
		},

		async invite(token: string) {
			const inv = await db.query.householdInvites.findFirst({ where: eq(householdInvites.token, token) });
			if (!inv || inv.expiresAt < new Date()) return null;
			const [house] = await db
				.select({ name: households.name, inviter: profiles.displayName })
				.from(households)
				.leftJoin(profiles, eq(profiles.userId, sql`${inv.createdBy}`))
				.where(eq(households.id, inv.householdId));
			return { householdId: inv.householdId, name: house?.name ?? '', inviter: house?.inviter ?? null };
		},

		/** Join and make it the active household (new scans go there). Single-use tokens. */
		async acceptInvite(userId: string, token: string) {
			const inv = await api.invite(token);
			if (!inv) return null;
			await db.transaction(async (tx) => {
				await tx.update(householdMembers).set({ isDefault: false }).where(eq(householdMembers.userId, userId));
				await tx
					.insert(householdMembers)
					.values({ householdId: inv.householdId, userId, role: 'member', isDefault: true })
					.onConflictDoUpdate({ target: [householdMembers.householdId, householdMembers.userId], set: { isDefault: true } });
				await tx.delete(householdInvites).where(eq(householdInvites.token, token));
			});
			return inv.householdId;
		},

		async members(householdId: string) {
			return db
				.select({ userId: householdMembers.userId, role: householdMembers.role, handle: profiles.handle, displayName: profiles.displayName })
				.from(householdMembers)
				.innerJoin(profiles, eq(profiles.userId, householdMembers.userId))
				.where(eq(householdMembers.householdId, householdId))
				.orderBy(asc(householdMembers.createdAt));
		},

		async setActive(userId: string, householdId: string) {
			await assertMember(userId, householdId);
			await db.transaction(async (tx) => {
				await tx.update(householdMembers).set({ isDefault: false }).where(eq(householdMembers.userId, userId));
				await tx.update(householdMembers).set({ isDefault: true }).where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)));
			});
		},

		/** Leave a shared household (not your last one). Its books stay with the household. */
		async leave(userId: string, householdId: string) {
			const all = await memberships(userId);
			if (all.length < 2) throw new Error('cannot leave your only household');
			await db.delete(householdMembers).where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, householdId)));
			const rest = all.filter((m) => m.householdId !== householdId);
			if (!rest.some((m) => m.isDefault)) await api.setActive(userId, rest[0]!.householdId);
		},

		async renameHousehold(userId: string, householdId: string, name: string) {
			await assertMember(userId, householdId);
			await db.update(households).set({ name }).where(eq(households.id, householdId));
		}
	};
	return api;
}

export type Shelves = ReturnType<typeof createShelves>;
