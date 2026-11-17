ALTER TABLE "task" DROP CONSTRAINT "task_status_id_task_status_id_fk";
--> statement-breakpoint
ALTER TABLE "task_status" ADD COLUMN "color" varchar(16);--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_status_id_task_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."task_status"("id") ON DELETE no action ON UPDATE no action;