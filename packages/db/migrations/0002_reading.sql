CREATE TYPE "public"."date_precision" AS ENUM('day', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."pace" AS ENUM('intensive', 'usual', 'slow');--> statement-breakpoint
CREATE TYPE "public"."read_format" AS ENUM('paper', 'ebook', 'audiobook');--> statement-breakpoint
CREATE TYPE "public"."read_outcome" AS ENUM('in_progress', 'finished', 'dnf');--> statement-breakpoint
CREATE TYPE "public"."reading_event" AS ENUM('started', 'progress', 'stuck', 'resumed', 'finished', 'dnf');--> statement-breakpoint
CREATE TYPE "public"."reading_status" AS ENUM('want_to_read', 'reading', 'stuck', 'read', 'dnf');--> statement-breakpoint
CREATE TYPE "public"."stuck_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'followers', 'friends', 'private');--> statement-breakpoint
CREATE TABLE "reading_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"read_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "reading_event" NOT NULL,
	"progress" integer,
	"data" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_goals" (
	"user_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"target" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_goals_user_id_year_pk" PRIMARY KEY("user_id","year")
);
--> statement-breakpoint
CREATE TABLE "reading_states" (
	"user_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"status" "reading_status" NOT NULL,
	"stuck_source" "stuck_source",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_states_user_id_work_id_pk" PRIMARY KEY("user_id","work_id")
);
--> statement-breakpoint
CREATE TABLE "reads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"edition_id" uuid,
	"format" "read_format" DEFAULT 'paper' NOT NULL,
	"outcome" "read_outcome" DEFAULT 'in_progress' NOT NULL,
	"started_on" date,
	"finished_on" date,
	"finished_precision" date_precision,
	"progress" integer,
	"total" integer,
	"rating" smallint,
	"review" text DEFAULT '' NOT NULL,
	"review_spoiler" boolean DEFAULT false NOT NULL,
	"duration_days_override" integer,
	"pace" "pace",
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"folded" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_folded_unique" UNIQUE("folded")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_work_tags" (
	"user_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_work_tags_user_id_work_id_tag_id_pk" PRIMARY KEY("user_id","work_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "work_series" (
	"work_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"position" numeric,
	CONSTRAINT "work_series_work_id_series_id_pk" PRIMARY KEY("work_id","series_id")
);
--> statement-breakpoint
ALTER TABLE "reading_events" ADD CONSTRAINT "reading_events_read_id_reads_id_fk" FOREIGN KEY ("read_id") REFERENCES "public"."reads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_events" ADD CONSTRAINT "reading_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_goals" ADD CONSTRAINT "reading_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_states" ADD CONSTRAINT "reading_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_states" ADD CONSTRAINT "reading_states_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reads" ADD CONSTRAINT "reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reads" ADD CONSTRAINT "reads_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reads" ADD CONSTRAINT "reads_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_work_tags" ADD CONSTRAINT "user_work_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_work_tags" ADD CONSTRAINT "user_work_tags_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_work_tags" ADD CONSTRAINT "user_work_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_series" ADD CONSTRAINT "work_series_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_series" ADD CONSTRAINT "work_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_events_read_idx" ON "reading_events" USING btree ("read_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reading_states_status_idx" ON "reading_states" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reads_user_work_idx" ON "reads" USING btree ("user_id","work_id");--> statement-breakpoint
CREATE INDEX "reads_user_finished_idx" ON "reads" USING btree ("user_id","outcome","finished_on");--> statement-breakpoint
CREATE INDEX "user_work_tags_work_idx" ON "user_work_tags" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "user_work_tags_tag_idx" ON "user_work_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "work_series_series_idx" ON "work_series" USING btree ("series_id","position");--> statement-breakpoint
-- Backfill series from the raw series info already stored on editions.
INSERT INTO "series" ("id", "name", "folded", "created_at", "updated_at")
SELECT gen_random_uuid(), min(e.series_name), lower(unaccent(trim(e.series_name))), now(), now()
FROM "editions" e
WHERE e.series_name IS NOT NULL AND trim(e.series_name) <> ''
GROUP BY lower(unaccent(trim(e.series_name)))
ON CONFLICT ("folded") DO NOTHING;
--> statement-breakpoint
INSERT INTO "work_series" ("work_id", "series_id", "position")
SELECT DISTINCT ON (e.work_id, s.id) e.work_id, s.id,
	nullif(substring(e.series_position from '([0-9]+(?:[.,][0-9]+)?)'), '')::numeric
FROM "editions" e
JOIN "series" s ON s.folded = lower(unaccent(trim(e.series_name)))
WHERE e.series_name IS NOT NULL
ON CONFLICT DO NOTHING;
