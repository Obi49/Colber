import type { Brand } from './brand.js';
import type { Did, SignatureScheme } from './did.js';

/** Stable, internal agent identifier (UUIDv7). */
export type AgentId = Brand<string, 'AgentId'>;

/** Stable, internal operator identifier (assigned by the operator-console). */
export type OperatorId = Brand<string, 'OperatorId'>;

export const asAgentId = (value: string): AgentId => value as AgentId;
export const asOperatorId = (value: string): OperatorId => value as OperatorId;

/**
 * Public-facing agent record returned by the identity service.
 * Mirrors the `agents` table in `agent-identity` (see drizzle schema).
 */
export interface AgentIdentity {
  readonly agentId: AgentId;
  readonly did: Did;
  readonly publicKey: string; // base64 (raw bytes of the public key)
  readonly signatureScheme: SignatureScheme;
  readonly ownerOperatorId: OperatorId;
  readonly registeredAt: string; // ISO-8601 UTC
  readonly revokedAt: string | null; // ISO-8601 UTC or null
}
