CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY NOT NULL,
  "did" text NOT NULL,
  "public_key" text NOT NULL,
  "signature_scheme" text NOT NULL,
  "owner_operator_id" text NOT NULL,
  "registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "agents_did_unique" UNIQUE("did")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_owner_operator_id_idx" ON "agents" ("owner_operator_id");
