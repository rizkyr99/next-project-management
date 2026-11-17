ALTER TABLE "task_assignee" ADD COLUMN "due_soon_notified_for" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "task_dueDate_idx" ON "task" USING btree ("due_date");