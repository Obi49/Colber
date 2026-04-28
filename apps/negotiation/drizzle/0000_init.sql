CREATE TABLE IF NOT EXISTS "negotiation_events" (
  "seq" bigserial PRIMARY KEY NOT NULL,
  "negotiation_id" uuid NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "idempotency_key" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "negotiation_events_by_negotiation_seq_idx" ON "negotiation_events" ("negotiation_id","seq");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "negotiation_events_idempotency_uq" ON "negotiation_events" ("negotiation_id","event_type","idempotency_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "negotiation_state" (
  "negotiation_id" uuid PRIMARY KEY NOT NULL,
  "status" varchar(32) NOT NULL,
  "strategy" varchar(32) NOT NULL,
  "terms" jsonb NOT NULL,
  "party_dids" text[] NOT NULL,
  "current_best_proposal_id" uuid,
  "proposals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "settled_signatures" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "negotiation_state_status_idx" ON "negotiation_state" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "negotiation_state_expires_idx" ON "negotiation_state" ("expires_at");
