ALTER TABLE "comment" ADD COLUMN "client_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Comments already written by guests (clients) stay visible to them.
UPDATE "comment" SET "client_visible" = true
WHERE "author_id" IN (
  SELECT m."user_id" FROM "member" m
  JOIN "task" t ON t."id" = "comment"."task_id"
  JOIN "project" p ON p."id" = t."project_id"
  WHERE m."workspace_id" = p."workspace_id" AND m."role" = 'guest'
);
