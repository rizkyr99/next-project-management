CREATE TYPE "public"."reaction" AS ENUM('thumbs_up', 'check', 'eyes');--> statement-breakpoint
ALTER TYPE "public"."priority" ADD VALUE 'none' BEFORE 'low';--> statement-breakpoint
ALTER TYPE "public"."priority" ADD VALUE 'urgent';--> statement-breakpoint
CREATE TABLE "comment_reaction" (
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" "reaction" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reaction_comment_id_user_id_reaction_pk" PRIMARY KEY("comment_id","user_id","reaction")
);
--> statement-breakpoint
CREATE TABLE "project_favorite" (
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_favorite_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "due_has_time" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_favorite" ADD CONSTRAINT "project_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_favorite" ADD CONSTRAINT "project_favorite_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_reaction_commentId_idx" ON "comment_reaction" USING btree ("comment_id");