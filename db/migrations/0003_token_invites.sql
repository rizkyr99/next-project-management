ALTER TYPE "public"."invite_status" ADD VALUE 'declined';--> statement-breakpoint
-- Invites created before token invites stored a raw token that no link ever
-- used, so they can never be accepted. Expire them so the new pending-email
-- unique index can't conflict with legacy data.
UPDATE "workspace_invite" SET "status" = 'expired' WHERE "status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "member_workspace_user_unique" ON "member" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invite_token_unique" ON "workspace_invite" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invite_pending_email_unique" ON "workspace_invite" USING btree ("workspace_id","email") WHERE status = 'pending';