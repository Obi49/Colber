CREATE TABLE IF NOT EXISTS "score_snapshots" (
  "id" uuid PRIMARY KEY NOT NULL,
  "did" text NOT NULL,
  "score" integer NOT NULL,
  "score_version" text NOT NULL,
  "computed_at" timestamp with time zone NOT NULL,
  "attestation" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_snapshots_did_idx" ON "score_snapshots" ("did");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_snapshots_computed_at_idx" ON "score_snapshots" ("computed_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_log" (
  "feedback_id" uuid PRIMARY KEY NOT NULL,
  "from_did" text NOT NULL,
  "to_did" text NOT NULL,
  "tx_id" text NOT NULL,
  "rating" smallint NOT NULL,
  "signed_at" timestamp with time zone NOT NULL,
  "signature" text NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_log_from_to_tx_uq" ON "feedback_log" ("from_did","to_did","tx_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_log_to_did_idx" ON "feedback_log" ("to_did");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merkle_anchors" (
  "id" uuid PRIMARY KEY NOT NULL,
  "root_hash" text NOT NULL,
  "tx_hash" text NOT NULL,
  "chain_id" integer NOT NULL,
  "anchored_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "merkle_anchors_root_hash_unique" UNIQUE("root_hash")
);
