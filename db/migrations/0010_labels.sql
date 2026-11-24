CREATE TABLE "label" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" varchar(40) NOT NULL,
	"color" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_label" (
	"task_id" text NOT NULL,
	"label_id" text NOT NULL,
	CONSTRAINT "task_label_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "label_workspace_name_unique" ON "label" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "task_label_labelId_idx" ON "task_label" USING btree ("label_id");