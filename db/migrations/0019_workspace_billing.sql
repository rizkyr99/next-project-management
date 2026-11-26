ALTER TABLE "subscription" DROP CONSTRAINT "subscription_user_id_unique";--> statement-breakpoint
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_workspace_id_unique" UNIQUE("workspace_id");