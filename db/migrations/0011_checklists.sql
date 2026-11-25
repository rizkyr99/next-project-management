CREATE TABLE "checklist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_item_taskId_idx" ON "checklist_item" USING btree ("task_id");