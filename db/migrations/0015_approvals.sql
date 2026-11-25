CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'changes_requested', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'approval_requested';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'task_approved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'changes_requested';--> statement-breakpoint
CREATE TABLE "task_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by_id" text,
	"message" text,
	"responded_by_id" text,
	"response_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "task_approval" ADD CONSTRAINT "task_approval_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_approval" ADD CONSTRAINT "task_approval_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_approval" ADD CONSTRAINT "task_approval_responded_by_id_user_id_fk" FOREIGN KEY ("responded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_approval_taskId_idx" ON "task_approval" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_approval_one_pending" ON "task_approval" USING btree ("task_id") WHERE "task_approval"."status" = 'pending';