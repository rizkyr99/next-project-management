ALTER TYPE "public"."notification_type" ADD VALUE 'task_comment';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'task_status_changed';--> statement-breakpoint
CREATE TABLE "task_follower" (
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_follower_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "detail" text;--> statement-breakpoint
ALTER TABLE "task_follower" ADD CONSTRAINT "task_follower_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_follower" ADD CONSTRAINT "task_follower_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Existing assignees follow the tasks they are on.
INSERT INTO "task_follower" ("task_id", "user_id") SELECT "task_id", "user_id" FROM "task_assignee" ON CONFLICT DO NOTHING;
