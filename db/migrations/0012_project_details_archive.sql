CREATE TYPE "public"."project_status" AS ENUM('on_track', 'at_risk', 'off_track', 'done');--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "client_name" varchar(100);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "deadline" date;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "status" "project_status";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "archived_at" timestamp;