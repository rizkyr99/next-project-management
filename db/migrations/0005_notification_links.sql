DROP INDEX "notification_userId_idx";--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "href" text;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_userId_createdAt_idx" ON "notification" USING btree ("user_id","created_at" DESC NULLS LAST);