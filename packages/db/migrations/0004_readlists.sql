CREATE TYPE "public"."readlist_visibility" AS ENUM('private', 'unlisted', 'public');--> statement-breakpoint
CREATE TABLE "readlist_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"readlist_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"edition_id" uuid,
	"position" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "readlist_items_work_uq" UNIQUE("readlist_id","work_id")
);
--> statement-breakpoint
CREATE TABLE "readlist_saves" (
	"user_id" uuid NOT NULL,
	"readlist_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "readlist_saves_user_id_readlist_id_pk" PRIMARY KEY("user_id","readlist_id")
);
--> statement-breakpoint
CREATE TABLE "readlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" "readlist_visibility" DEFAULT 'private' NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "readlists_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "readlist_items" ADD CONSTRAINT "readlist_items_readlist_id_readlists_id_fk" FOREIGN KEY ("readlist_id") REFERENCES "public"."readlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readlist_items" ADD CONSTRAINT "readlist_items_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readlist_items" ADD CONSTRAINT "readlist_items_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readlist_saves" ADD CONSTRAINT "readlist_saves_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readlist_saves" ADD CONSTRAINT "readlist_saves_readlist_id_readlists_id_fk" FOREIGN KEY ("readlist_id") REFERENCES "public"."readlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readlists" ADD CONSTRAINT "readlists_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "readlist_items_order_idx" ON "readlist_items" USING btree ("readlist_id","position");--> statement-breakpoint
CREATE INDEX "readlist_saves_list_idx" ON "readlist_saves" USING btree ("readlist_id");--> statement-breakpoint
CREATE INDEX "readlists_owner_idx" ON "readlists" USING btree ("owner_id","updated_at");