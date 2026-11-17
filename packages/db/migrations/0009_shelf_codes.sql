ALTER TABLE "sections" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_code_uq" UNIQUE("household_id","code");