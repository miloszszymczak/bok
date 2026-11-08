import { isHandleAvailableSyntax } from '@bok/server';
import { profiles, user } from '@bok/db';
import { fail, redirect } from '@sveltejs/kit';
import { and, eq, ne } from 'drizzle-orm';
import { m } from '#lib/paraglide/messages.js';
import { getAuth } from '#lib/server/auth.ts';
import { guard } from '#lib/server/api.ts';
import { locales } from '#lib/paraglide/runtime.js';
import type { Actions, PageServerLoad } from './$types';

const TIMEZONES = Intl.supportedValuesOf('timeZone');

export const load: PageServerLoad = async ({ locals }) => {
	const p = (await locals.svc.accounts.getProfile(locals.user!.id))!;
	const { shelves } = locals.svc;
	const memberships = await shelves.memberships(locals.user!.id);
	const active = memberships.find((m) => m.isDefault) ?? memberships[0]!;
	return {
		households: memberships.map((m) => ({ id: m.householdId, name: m.name, active: m.householdId === active.householdId })),
		members: await shelves.members(active.householdId),
		form: { displayName: p.displayName, handle: p.handle, bio: p.bio, timezone: p.timezone, locale: p.locale },
		timezones: TIMEZONES,
		email: locals.user!.email,
		deletionRequestedAt: p.deletionRequestedAt?.toISOString() ?? null
	};
};

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const f = await request.formData();
		const displayName = String(f.get('displayName') ?? '').trim().slice(0, 60);
		const handle = String(f.get('handle') ?? '').trim().toLowerCase();
		const bio = String(f.get('bio') ?? '').trim().slice(0, 500);
		const timezone = String(f.get('timezone') ?? '');
		const values = { displayName, handle, bio, timezone };
		if (!displayName) return fail(400, { section: 'profile', values, error: m.settings_err_name() });
		if (!isHandleAvailableSyntax(handle)) return fail(400, { section: 'profile', values, error: m.settings_err_handle() });
		if (!TIMEZONES.includes(timezone)) return fail(400, { section: 'profile', values, error: m.settings_err_timezone() });
		const { db } = locals.svc;
		const taken = await db.query.profiles.findFirst({ where: and(eq(profiles.handle, handle), ne(profiles.userId, locals.user!.id)) });
		if (taken) return fail(400, { section: 'profile', values, error: m.settings_err_handle_taken() });
		await db.update(profiles).set(values).where(eq(profiles.userId, locals.user!.id));
		await db.update(user).set({ name: displayName }).where(eq(user.id, locals.user!.id));
		return { section: 'profile', saved: true };
	},
	preferences: async ({ request, locals, cookies }) => {
		const f = await request.formData();
		const locale = String(f.get('locale') ?? '');
		const theme = String(f.get('theme') ?? 'system');
		if ((locales as readonly string[]).includes(locale)) {
			await locals.svc.db.update(profiles).set({ locale }).where(eq(profiles.userId, locals.user!.id));
			cookies.set('PARAGLIDE_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 400, httpOnly: false, sameSite: 'lax' });
		}
		if (['system', 'light', 'dark'].includes(theme)) {
			cookies.set('theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 400, httpOnly: false, sameSite: 'lax' });
		}
		redirect(303, '/settings');
	},
	invite: async ({ locals, url }) => {
		const token = await locals.svc.shelves.createInvite(locals.user!.id);
		return { section: 'household', inviteUrl: `${url.origin}/join/${token}` };
	},
	switchHousehold: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		await guard(() => locals.svc.shelves.setActive(locals.user!.id, id));
		return { section: 'household' };
	},
	renameHousehold: async ({ request, locals }) => {
		const f = await request.formData();
		const name = String(f.get('name') ?? '').trim().slice(0, 80);
		if (!name) return fail(400, { section: 'household', error: m.shelves_err_name() });
		await guard(() => locals.svc.shelves.renameHousehold(locals.user!.id, String(f.get('id') ?? ''), name));
		return { section: 'household' };
	},
	leaveHousehold: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		try {
			await guard(() => locals.svc.shelves.leave(locals.user!.id, id));
		} catch (e) {
			if (e instanceof Error && /only household/.test(e.message)) return fail(400, { section: 'household', error: m.household_cant_leave() });
			throw e;
		}
		return { section: 'household' };
	},
	deleteAccount: async ({ request, locals }) => {
		const confirm = String((await request.formData()).get('confirm') ?? '').trim().toLowerCase();
		const p = await locals.svc.accounts.getProfile(locals.user!.id);
		if (!p || confirm !== p.handle.toLowerCase()) return fail(400, { section: 'danger', error: m.settings_delete_mismatch() });
		await locals.svc.accounts.requestDeletion(locals.user!.id);
		// Sign out everywhere else; this device stays signed in to see the cancel option.
		await getAuth(locals.svc).api.revokeOtherSessions({ headers: request.headers });
		return { section: 'danger', scheduled: true };
	},
	cancelDeletion: async ({ locals }) => {
		await locals.svc.accounts.cancelDeletion(locals.user!.id);
		return { section: 'danger', cancelled: true };
	}
};
