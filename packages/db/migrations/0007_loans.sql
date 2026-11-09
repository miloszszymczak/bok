CREATE TYPE "public"."loan_status" AS ENUM('requested', 'active', 'returned', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"copy_id" uuid,
	"work_id" uuid NOT NULL,
	"edition_id" uuid,
	"lender_id" uuid,
	"lender_name" text,
	"borrower_id" uuid,
	"borrower_name" text,
	"status" "loan_status" NOT NULL,
	"requested_at" timestamp with time zone,
	"lent_on" date,
	"due_on" date,
	"returned_on" date,
	"return_marked_at" timestamp with time zone,
	"extension_to" date,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_lender_present" CHECK ("loans"."lender_id" is not null or "loans"."lender_name" is not null),
	CONSTRAINT "loans_borrower_present" CHECK ("loans"."borrower_id" is not null or "loans"."borrower_name" is not null),
	CONSTRAINT "loans_someone_in_app" CHECK ("loans"."lender_id" is not null or "loans"."borrower_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_copy_id_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_lender_id_user_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_id_user_id_fk" FOREIGN KEY ("borrower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loans_copy_active_uq" ON "loans" USING btree ("copy_id") WHERE "loans"."status" = 'active' and "loans"."copy_id" is not null;--> statement-breakpoint
CREATE INDEX "loans_lender_idx" ON "loans" USING btree ("lender_id","status");--> statement-breakpoint
CREATE INDEX "loans_borrower_idx" ON "loans" USING btree ("borrower_id","status");--> statement-breakpoint
CREATE INDEX "loans_due_idx" ON "loans" USING btree ("due_on") WHERE "loans"."status" = 'active';