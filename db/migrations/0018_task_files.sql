ALTER TABLE "attachment" ADD COLUMN "listed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "client_visible" boolean DEFAULT false NOT NULL;