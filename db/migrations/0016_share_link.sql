ALTER TABLE "project" ADD COLUMN "share_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "project_share_token_unique" ON "project" USING btree ("share_token");