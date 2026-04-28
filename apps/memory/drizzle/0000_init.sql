CREATE TABLE IF NOT EXISTS "memories" (
  "id" uuid PRIMARY KEY NOT NULL,
  "owner_did" text NOT NULL,
  "type" text NOT NULL,
  "text" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "visibility" text NOT NULL,
  "shared_with" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "encryption_enabled" text DEFAULT 'false' NOT NULL,
  "encryption_algorithm" text DEFAULT '' NOT NULL,
  "encryption_key_id" text DEFAULT '' NOT NULL,
  "embedding_model" text NOT NULL,
  "embedding_dim" integer NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_owner_did_idx" ON "memories" ("owner_did");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_type_idx" ON "memories" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_visibility_idx" ON "memories" ("visibility");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_created_at_idx" ON "memories" ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_versions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "memory_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "text" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "author_did" text NOT NULL,
  "encryption_enabled" text DEFAULT 'false' NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_versions_memory_id_idx" ON "memory_versions" ("memory_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memory_versions_memory_version_uq" ON "memory_versions" ("memory_id","version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_shares" (
  "id" uuid PRIMARY KEY NOT NULL,
  "memory_id" uuid NOT NULL,
  "granted_to_did" text NOT NULL,
  "granted_by_did" text NOT NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memory_shares_memory_grantee_uq" ON "memory_shares" ("memory_id","granted_to_did");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_shares_grantee_idx" ON "memory_shares" ("granted_to_did");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_quotas" (
  "owner_did" text PRIMARY KEY NOT NULL,
  "bytes_stored" bigint DEFAULT 0 NOT NULL,
  "memory_count" integer DEFAULT 0 NOT NULL,
  "requests_this_month" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
