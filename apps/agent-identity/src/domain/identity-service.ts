import { encodeDidKey, fromBase64, getSignatureProvider, toBase64 } from '@praxis/core-crypto';
import {
  asAgentId,
  asOperatorId,
  ERROR_CODES,
  PraxisError,
  type AgentIdentity,
  type Did,
} from '@praxis/core-types';
import { v7 as uuidv7 } from 'uuid';

import type { AgentRepository } from './agent-repository.js';

/**
 * Inputs are kept narrow: services validate at the edge (HTTP/gRPC/MCP)
 * and pass already-shaped DTOs into this layer. The domain has no
 * knowledge of HTTP, transport, or framework — it's pure logic + repo.
 */
export interface RegisterAgentInput {
  readonly publicKeyBase64: string;
  readonly ownerOperatorId: string;
}

export interface VerifySignatureInput {
  readonly did: string;
  readonly messageBase64: string;
  readonly signatureBase64: string;
}

export class IdentityService {
  constructor(private readonly repo: AgentRepository) {}

  /**
   * Registers a new agent identity. The DID is derived deterministically
   * from the public key (did:key + Ed25519). Idempotent per public key:
   * re-registering the same key returns a 409 Conflict.
   */
  public async register(input: RegisterAgentInput): Promise<AgentIdentity> {
    let publicKey: Uint8Array;
    try {
      publicKey = fromBase64(input.publicKeyBase64);
    } catch {
      throw new PraxisError(
        ERROR_CODES.INVALID_PUBLIC_KEY,
        'publicKey must be valid base64',
        400,
      );
    }

    const provider = getSignatureProvider('Ed25519');
    if (!provider.isValidPublicKey(publicKey)) {
      throw new PraxisError(
        ERROR_CODES.INVALID_PUBLIC_KEY,
        `Ed25519 public key must be 32 bytes, got ${publicKey.length}`,
        400,
        { length: publicKey.length },
      );
    }

    const did = encodeDidKey(publicKey, 'Ed25519');

    const existing = await this.repo.findByDid(did);
    if (existing) {
      throw new PraxisError(
        ERROR_CODES.DID_ALREADY_REGISTERED,
        `DID is already registered: ${did}`,
        409,
        { did },
      );
    }

    const agentId = asAgentId(uuidv7());
    const now = new Date();

    await this.repo.insert({
      id: agentId,
      did,
      publicKey: toBase64(publicKey),
      signatureScheme: 'Ed25519',
      ownerOperatorId: asOperatorId(input.ownerOperatorId),
      registeredAt: now,
      revokedAt: null,
    });

    return {
      agentId,
      did,
      publicKey: toBase64(publicKey),
      signatureScheme: 'Ed25519',
      ownerOperatorId: asOperatorId(input.ownerOperatorId),
      registeredAt: now.toISOString(),
      revokedAt: null,
    };
  }

  /**
   * Resolves a DID to its agent record. Throws `DID_NOT_FOUND` if absent.
   * Includes revoked agents (callers decide whether to honour them).
   */
  public async resolve(did: string): Promise<AgentIdentity> {
    const record = await this.repo.findByDid(did as Did);
    if (!record) {
      throw new PraxisError(ERROR_CODES.DID_NOT_FOUND, `DID not found: ${did}`, 404, { did });
    }
    return record;
  }

  /**
   * Verifies a signature against the public key associated with a DID.
   *
   * Returns `{ valid: false }` for any verification failure (wrong key,
   * tampered message, malformed signature). Throws only for system-level
   * errors: unknown DID, unsupported scheme, malformed inputs.
   */
  public async verify(input: VerifySignatureInput): Promise<{ valid: boolean; reason?: string }> {
    const record = await this.repo.findByDid(input.did as Did);
    if (!record) {
      throw new PraxisError(ERROR_CODES.DID_NOT_FOUND, `DID not found: ${input.did}`, 404, {
        did: input.did,
      });
    }
    if (record.revokedAt !== null) {
      throw new PraxisError(ERROR_CODES.DID_REVOKED, `DID is revoked: ${input.did}`, 410, {
        did: input.did,
        revokedAt: record.revokedAt,
      });
    }

    let message: Uint8Array;
    let signature: Uint8Array;
    try {
      message = fromBase64(input.messageBase64);
      signature = fromBase64(input.signatureBase64);
    } catch {
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        'message and signature must be valid base64',
        400,
      );
    }

    const publicKey = fromBase64(record.publicKey);
    const provider = getSignatureProvider(record.signatureScheme);
    const result = await provider.verify(message, signature, publicKey);

    return result.valid
      ? { valid: true }
      : { valid: false, reason: result.reason ?? 'unknown' };
  }
}
