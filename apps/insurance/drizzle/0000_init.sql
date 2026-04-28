CREATE TABLE IF NOT EXISTS "policies" (
  "id" uuid PRIMARY KEY NOT NULL,
  "subscriber_did" varchar(512) NOT NULL,
  "beneficiary_did" varchar(512) NOT NULL,
  "deal_subject" varchar(256) NOT NULL,
  "amount_usdc" numeric(18, 6) NOT NULL,
  "premium_usdc" numeric(18, 6) NOT NULL,
  "risk_multiplier" numeric(6, 3) NOT NULL,
  "reputation_score" integer NOT NULL,
  "sla_terms" jsonb NOT NULL,
  "status" varchar(32) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  CONSTRAINT "policies_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_subscriber_did_idx" ON "policies" ("subscriber_did");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_status_idx" ON "policies" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_expires_active_idx" ON "policies" ("expires_at") WHERE status IN ('pending','active');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "escrow_holdings" (
  "id" uuid PRIMARY KEY NOT NULL,
  "policy_id" uuid NOT NULL,
  "amount_usdc" numeric(18, 6) NOT NULL,
  "status" varchar(32) NOT NULL,
  "locked_at" timestamp with time zone NOT NULL,
  "released_at" timestamp with time zone,
  "claimed_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  CONSTRAINT "escrow_holdings_policy_id_unique" UNIQUE("policy_id"),
  CONSTRAINT "escrow_holdings_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "escrow_holdings_status_idx" ON "escrow_holdings" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "escrow_events" (
  "seq" bigserial PRIMARY KEY NOT NULL,
  "holding_id" uuid NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  CONSTRAINT "escrow_events_holding_id_fk" FOREIGN KEY ("holding_id") REFERENCES "escrow_holdings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "escrow_events_holding_seq_idx" ON "escrow_events" ("holding_id","seq");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "claims" (
  "id" uuid PRIMARY KEY NOT NULL,
  "policy_id" uuid NOT NULL,
  "claimant_did" varchar(512) NOT NULL,
  "reason" text NOT NULL,
  "evidence" jsonb NOT NULL,
  "status" varchar(32) NOT NULL,
  "decided_at" timestamp with time zone,
  "payout_usdc" numeric(18, 6),
  "created_at" timestamp with time zone NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  CONSTRAINT "claims_policy_idempotency_uq" UNIQUE("policy_id","idempotency_key"),
  CONSTRAINT "claims_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claims_policy_status_idx" ON "claims" ("policy_id","status");
