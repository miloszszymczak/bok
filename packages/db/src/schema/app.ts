
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	smallint,
	text,
	numeric,
	real,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth.ts';
import { citext, id, timestamps } from './types.ts';

// ── People ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('role', ['user', 'admin']);

export const profiles = pgTable('profiles', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	handle: citext('handle').notNull().unique(),
	displayName: text('display_name').notNull(),
	bio: text('bio').notNull().default(''),
	avatarKey: text('avatar_key'),
	locale: text('locale').notNull().default('en'),
	timezone: text('timezone').notNull().default('Europe/Warsaw'),
	role: roleEnum('role').notNull().default('user'),
	deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
	...timestamps
});

export const households = pgTable('households', {
	id: id(),
	name: text('name').notNull(),
	createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
	...timestamps
});

export const householdRoleEnum = pgEnum('household_role', ['owner', 'member']);

export const householdMembers = pgTable(
	'household_members',
	{
		householdId: uuid('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: householdRoleEnum('role').notNull().default('member'),
		isDefault: boolean('is_default').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.householdId, t.userId] }), index('household_members_user_idx').on(t.userId)]
);

// ── Catalogue ─────────────────────────────────────────────────────────────────

export const authors = pgTable(
	'authors',
	{
		id: id(),
		name: text('name').notNull(),
		sortName: text('sort_name').notNull(),
		/** Folded (lowercase, no diacritics) name used for matching and search. */
		folded: text('folded').notNull(),
		olKey: text('ol_key').unique(),
		...timestamps
	},
	(t) => [index('authors_folded_trgm').using('gin', t.folded.op('gin_trgm_ops'))]
);

export const works = pgTable(
	'works',
	{
		id: id(),
		title: text('title').notNull(),
		subtitle: text('subtitle'),
		originalTitle: text('original_title'),
		/** Folded titles for exact work matching across translations. */
		foldedTitle: text('folded_title').notNull(),
		foldedOriginalTitle: text('folded_original_title'),
		originalLanguage: text('original_language'),
		firstPublishedYear: smallint('first_published_year'),
		description: text('description'),
		olKey: text('ol_key').unique(),
		/** Folded "title subtitle original_title authors" maintained by the app. */
		searchText: text('search_text').notNull().default(''),
		...timestamps
	},
	(t) => [
		index('works_search_trgm').using('gin', t.searchText.op('gin_trgm_ops')),
		index('works_folded_title_idx').on(t.foldedTitle),
		index('works_folded_original_title_idx').on(t.foldedOriginalTitle)
	]
);

export const contributorRoleEnum = pgEnum('contributor_role', ['author', 'translator', 'illustrator', 'editor', 'narrator']);

export const workAuthors = pgTable(
	'work_authors',
	{
		workId: uuid('work_id')
			.notNull()
			.references(() => works.id, { onDelete: 'cascade' }),
		authorId: uuid('author_id')
			.notNull()
			.references(() => authors.id, { onDelete: 'cascade' }),
		position: smallint('position').notNull().default(0)
	},
	(t) => [primaryKey({ columns: [t.workId, t.authorId] }), index('work_authors_author_idx').on(t.authorId)]
);

export const formatEnum = pgEnum('book_format', ['paperback', 'hardcover', 'ebook', 'audiobook', 'other']);
export const coverStatusEnum = pgEnum('cover_status', ['none', 'pending', 'ready', 'failed']);

export const editions = pgTable(
	'editions',
	{
		id: id(),
		workId: uuid('work_id')
			.notNull()
			.references(() => works.id, { onDelete: 'restrict' }),
		isbn13: text('isbn13').unique(),
		isbn10: text('isbn10'),
		issn: text('issn'),
		title: text('title').notNull(),
		subtitle: text('subtitle'),
		publisher: text('publisher'),
		publishedDate: text('published_date'),
		publishedYear: smallint('published_year'),
		pageCount: integer('page_count'),
		language: text('language'),
		format: formatEnum('format'),
		editionStatement: text('edition_statement'),
		/** Raw series info from metadata; normalised into `series` in phase 4. */
		seriesName: text('series_name'),
		seriesPosition: text('series_position'),
		description: text('description'),
		coverKey: text('cover_key'),
		coverSourceUrl: text('cover_source_url'),
		coverStatus: coverStatusEnum('cover_status').notNull().default('none'),
		/** 0–100 completeness score of the merged record. */
		metadataQuality: smallint('metadata_quality').notNull().default(0),
		metadataFetchedAt: timestamp('metadata_fetched_at', { withTimezone: true }),
		createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [index('editions_work_idx').on(t.workId), index('editions_issn_idx').on(t.issn)]
);

export const editionContributors = pgTable(
	'edition_contributors',
	{
		editionId: uuid('edition_id')
			.notNull()
			.references(() => editions.id, { onDelete: 'cascade' }),
		authorId: uuid('author_id')
			.notNull()
			.references(() => authors.id, { onDelete: 'cascade' }),
		role: contributorRoleEnum('role').notNull(),
		position: smallint('position').notNull().default(0)
	},
	(t) => [primaryKey({ columns: [t.editionId, t.authorId, t.role] })]
);

export const editionSources = pgTable(
	'edition_sources',
	{
		editionId: uuid('edition_id')
			.notNull()
			.references(() => editions.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		externalId: text('external_id'),
		raw: jsonb('raw').notNull(),
		fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.editionId, t.provider] })]
);

export const metadataEdits = pgTable(
	'metadata_edits',
	{
		id: id(),
		entity: text('entity', { enum: ['work', 'edition'] }).notNull(),
		entityId: uuid('entity_id').notNull(),
		userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
		diff: jsonb('diff').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('metadata_edits_entity_idx').on(t.entity, t.entityId)]
);

// ── Storage: rooms → furniture → sections ──────────────────────────────────

/** Rooms (or any place: "Office", "Parents' house"). */
export const locations = pgTable(
	'locations',
	{
		id: id(),
		householdId: uuid('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		position: integer('position').notNull().default(0),
		...timestamps
	},
	(t) => [index('locations_household_idx').on(t.householdId, t.position)]
);

export const containerTypeEnum = pgEnum('container_type', ['bookcase', 'box', 'pile', 'other']);

export interface ContainerLayout {
	/** Outer size in centimetres (drives the sketch's proportions). */
	width: number;
	height: number;
	/** Left to right; each column's shelf heights top to bottom sum to `height`, widths sum to `width`. */
	columns: { w: number; shelves: number[] }[];
}

/** A piece of furniture. Only bookcases exist today; `type` + `layout` leave room for others. */
export const containers = pgTable(
	'containers',
	{
		id: id(),
		householdId: uuid('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		locationId: uuid('location_id')
			.notNull()
			.references(() => locations.id, { onDelete: 'cascade' }),
		type: containerTypeEnum('type').notNull().default('bookcase'),
		name: text('name').notNull(),
		position: integer('position').notNull().default(0),
		layout: jsonb('layout').$type<ContainerLayout>().notNull(),
		...timestamps
	},
	(t) => [index('containers_location_idx').on(t.locationId, t.position)]
);

/** One shelf (cell) of a container: a rectangle in the container's grid, keyed by column/row. */
export const sections = pgTable(
	'sections',
	{
		id: id(),
		householdId: uuid('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		containerId: uuid('container_id')
			.notNull()
			.references(() => containers.id, { onDelete: 'cascade' }),
		col: smallint('col').notNull(),
		row: smallint('row').notNull(),
		x: real('x').notNull(),
		y: real('y').notNull(),
		w: real('w').notNull(),
		h: real('h').notNull(),
		/** Null = automatic label (A1, A2 … B1). */
		customLabel: text('custom_label'),
		...timestamps
	},
	(t) => [unique('sections_cell_uq').on(t.containerId, t.col, t.row)]
);

export const householdInvites = pgTable('household_invites', {
	token: text('token').primaryKey(),
	householdId: uuid('household_id')
		.notNull()
		.references(() => households.id, { onDelete: 'cascade' }),
	createdBy: uuid('created_by').references(() => user.id, { onDelete: 'set null' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export interface InventoryResult {
	confirmed: string[];
	missing: string[];
	misplaced: { copyId: string; fromSectionId: string | null }[];
	unknown: string[];
	fixed: { moved: number; added: number; unsorted: number };
}

export const inventorySessions = pgTable(
	'inventory_sessions',
	{
		id: id(),
		householdId: uuid('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
		userId: uuid('user_id').references(() => user.id, { onDelete: 'set null' }),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
		finishedAt: timestamp('finished_at', { withTimezone: true }).notNull().defaultNow(),
		result: jsonb('result').$type<InventoryResult>().notNull()
	},
	(t) => [index('inventory_sessions_section_idx').on(t.sectionId, t.finishedAt)]
);

// ── Physical copies ───────────────────────────────────────────────────────────

export const copyStateEnum = pgEnum('copy_state', ['shelved', 'lent', 'lost']);

export const copies = pgTable(
	'copies',
	{
		id: id(),
		householdId: uuid('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		editionId: uuid('edition_id')
			.notNull()
			.references(() => editions.id, { onDelete: 'restrict' }),
		ownerUserId: uuid('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
		/** Null = "Unsorted". */
		sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
		state: copyStateEnum('state').notNull().default('shelved'),
		lendable: boolean('lendable').notNull().default(false),
		acquiredOn: date('acquired_on'),
		notes: text('notes').notNull().default(''),
		...timestamps
	},
	(t) => [index('copies_household_edition_idx').on(t.householdId, t.editionId), index('copies_section_idx').on(t.sectionId)]
);


// ── Reading ───────────────────────────────────────────────────────────────────

export const readingStatusEnum = pgEnum('reading_status', ['want_to_read', 'reading', 'stuck', 'read', 'dnf']);
export const stuckSourceEnum = pgEnum('stuck_source', ['auto', 'manual']);
export const readFormatEnum = pgEnum('read_format', ['paper', 'ebook', 'audiobook']);
export const readOutcomeEnum = pgEnum('read_outcome', ['in_progress', 'finished', 'dnf']);
export const datePrecisionEnum = pgEnum('date_precision', ['day', 'month', 'year']);
export const paceEnum = pgEnum('pace', ['intensive', 'usual', 'slow']);
export const visibilityEnum = pgEnum('visibility', ['public', 'followers', 'friends', 'private']);
export const readingEventEnum = pgEnum('reading_event', ['started', 'progress', 'stuck', 'resumed', 'finished', 'dnf']);

/** One row per user × work: the status shown everywhere. History lives in `reads`. */
export const readingStates = pgTable(
	'reading_states',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		workId: uuid('work_id')
			.notNull()
			.references(() => works.id, { onDelete: 'cascade' }),
		status: readingStatusEnum('status').notNull(),
		stuckSource: stuckSourceEnum('stuck_source'),
		...timestamps
	},
	(t) => [primaryKey({ columns: [t.userId, t.workId] }), index('reading_states_status_idx').on(t.status)]
);

/** One reading of a book (rereads are separate rows). */
export const reads = pgTable(
	'reads',
	{
		id: id(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		workId: uuid('work_id')
			.notNull()
			.references(() => works.id, { onDelete: 'cascade' }),
		editionId: uuid('edition_id').references(() => editions.id, { onDelete: 'set null' }),
		format: readFormatEnum('format').notNull().default('paper'),
		outcome: readOutcomeEnum('outcome').notNull().default('in_progress'),
		startedOn: date('started_on'),
		/** Finished/abandoned date; with `finishedPrecision` month or year only the leading parts matter. */
		finishedOn: date('finished_on'),
		finishedPrecision: datePrecisionEnum('finished_precision'),
		/** Pages for paper/ebook-with-pages, 0–100 for percent-only ebooks, minutes for audiobooks. */
		progress: integer('progress'),
		total: integer('total'),
		rating: smallint('rating'),
		review: text('review').notNull().default(''),
		reviewSpoiler: boolean('review_spoiler').notNull().default(false),
		durationDaysOverride: integer('duration_days_override'),
		pace: paceEnum('pace'),
		visibility: visibilityEnum('visibility').notNull().default('public'),
		/** Last start/progress/resume — drives the 30-day "stuck" rule. */
		lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
		...timestamps
	},
	(t) => [index('reads_user_work_idx').on(t.userId, t.workId), index('reads_user_finished_idx').on(t.userId, t.outcome, t.finishedOn)]
);

export const readingEvents = pgTable(
	'reading_events',
	{
		id: id(),
		readId: uuid('read_id')
			.notNull()
			.references(() => reads.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: readingEventEnum('type').notNull(),
		progress: integer('progress'),
		/** e.g. stuck: { source: 'auto' | 'manual' } */
		data: jsonb('data'),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('reading_events_read_idx').on(t.readId, t.occurredAt)]
);

export const readingGoals = pgTable(
	'reading_goals',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		year: smallint('year').notNull(),
		target: smallint('target').notNull(),
		...timestamps
	},
	(t) => [primaryKey({ columns: [t.userId, t.year] })]
);

// ── Series & tags ─────────────────────────────────────────────────────────────

export const series = pgTable('series', {
	id: id(),
	name: text('name').notNull(),
	folded: text('folded').notNull().unique(),
	...timestamps
});

export const workSeries = pgTable(
	'work_series',
	{
		workId: uuid('work_id')
			.notNull()
			.references(() => works.id, { onDelete: 'cascade' }),
		seriesId: uuid('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		position: numeric('position', { mode: 'number' })
	},
	(t) => [primaryKey({ columns: [t.workId, t.seriesId] }), index('work_series_series_idx').on(t.seriesId, t.position)]
);

export const tags = pgTable('tags', {
	id: id(),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const userWorkTags = pgTable(
	'user_work_tags',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		workId: uuid('work_id')
			.notNull()
			.references(() => works.id, { onDelete: 'cascade' }),
		tagId: uuid('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.userId, t.workId, t.tagId] }), index('user_work_tags_work_idx').on(t.workId), index('user_work_tags_tag_idx').on(t.tagId)]
);
