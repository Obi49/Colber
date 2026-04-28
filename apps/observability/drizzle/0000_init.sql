CREATE TABLE IF NOT EXISTS "alert_rules" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_operator_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "scope" text NOT NULL,
  "condition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cooldown_seconds" integer DEFAULT 300 NOT NULL,
  "notification" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_owner_operator_idx" ON "alert_rules" ("owner_operator_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alert_rules_owner_name_uq" ON "alert_rules" ("owner_operator_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_enabled_idx" ON "alert_rules" ("enabled");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_rules_scope_idx" ON "alert_rules" ("scope");
