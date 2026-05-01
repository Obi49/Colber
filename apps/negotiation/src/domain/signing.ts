import { fromBase64, getSignatureProvider } from '@colber/core-crypto';
import { ERROR_CODES, ColberError } from '@colber/core-types';

import { canonicalizeBytes } from './canonical-json.js';

import type { Proposal, SettlementSignature } from './negotiation-types.js';

/**
 * Ed25519 + JCS verification helpers for the negotiation broker.
 *
 * Conventions (mirror `apps/reputation`):
 *   - The bytes signed are the JCS canonicalisation of a deterministic
 *     payload — never the raw HTTP body, never re-stringified JSON.
 *   - Public keys are passed inline (base64) for the MVP. Resolving them
 *     via `agent-identity` is documented as a P2 hardening step.
 *   - Signatures are base64.
 *
 * NOTE: on-chain anchoring (EIP-712, Base Sepolia) is OUT OF SCOPE for v1.
 * See `contract-signer.ts` for the placeholder.
 */

const provider = getSignatureProvider('Ed25519');

/**
 * The JCS payload signed by a participant for a `Proposal`. Excludes the
 * `signature` field (signatures are computed over everything else).
 */
export interface ProposalCanonicalPayload {
  readonly proposalId: string;
  readonly fromDid: string;
  readonly amount?: number;
  readonly scores?: Record<string, number>;
  readonly payload?: Record<string, unknown>;
  readonly proposedAt: string;
}

const proposalToCanonical = (p: Proposal): ProposalCanonicalPayload => {
  const out: ProposalCanonicalPayload = {
    proposalId: p.proposalId,
    fromDid: p.fromDid,
    proposedAt: p.proposedAt,
    ...(p.amount !== undefined ? { amount: p.amount } : {}),
    ...(p.scores !== undefined ? { scores: { ...p.scores } } : {}),
    ...(p.payload !== undefined ? { payload: { ...p.payload } } : {}),
  };
  return out;
};

const decodeBase64OrThrow = (raw: string, label: string): Uint8Array => {
  try {
    return fromBase64(raw);
  } catch {
    throw new ColberError(ERROR_CODES.VALIDATION_FAILED, `${label} must be valid base64`, 400);
  }
};

const ED25519_PUBKEY_BYTES = 32;

/**
 * Verify an Ed25519 signature on a proposal against the given base64 public key.
 * Throws `ColberError(INVALID_SIGNATURE)` on verification failure so HTTP
 * handlers map cleanly to 400. Never returns `false` — either it succeeds or
 * an error propagates.
 */
export const verifyProposalSignature = async (
  proposal: Proposal,
  publicKeyB64: string,
): Promise<void> => {
  const publicKey = decodeBase64OrThrow(publicKeyB64, 'publicKey');
  if (publicKey.length !== ED25519_PUBKEY_BYTES) {
    throw new ColberError(
      ERROR_CODES.INVALID_PUBLIC_KEY,
      `Ed25519 public key must be ${ED25519_PUBKEY_BYTES} bytes, got ${publicKey.length}`,
      400,
    );
  }
  const signature = decodeBase64OrThrow(proposal.signature, 'proposal.signature');
  const bytes = canonicalizeBytes(proposalToCanonical(proposal));
  const result = await provider.verify(bytes, signature, publicKey);
  if (!result.valid) {
    throw new ColberError(
      ERROR_CODES.INVALID_SIGNATURE,
      `Proposal signature verification failed: ${result.reason ?? 'unknown'}`,
      400,
    );
  }
};

/**
 * The JCS payload each party signs at settlement time.
 */
export interface SettlementCanonicalPayload {
  readonly negotiationId: string;
  readonly winningProposalId: string;
}

/**
 * Verify a settlement signature: each `partyDid` must have provided a
 * base64 Ed25519 signature over the JCS canonicalisation of
 * `{ negotiationId, winningProposalId }`, and the matching public key must
 * be supplied alongside.
 *
 * Throws `ColberError(INVALID_SIGNATURE)` on the first failing signature.
 */
export const verifySettlementSignatures = async (
  payload: SettlementCanonicalPayload,
  signatures: readonly SettlementSignature[],
  publicKeysByDid: ReadonlyMap<string, string>,
): Promise<void> => {
  const bytes = canonicalizeBytes(payload);
  for (const entry of signatures) {
    const pkB64 = publicKeysByDid.get(entry.did);
    if (!pkB64) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `Missing publicKey for did=${entry.did}`,
        400,
      );
    }
    const publicKey = decodeBase64OrThrow(pkB64, `publicKey[${entry.did}]`);
    if (publicKey.length !== ED25519_PUBKEY_BYTES) {
      throw new ColberError(
        ERROR_CODES.INVALID_PUBLIC_KEY,
        `Ed25519 public key must be ${ED25519_PUBKEY_BYTES} bytes, got ${publicKey.length} (did=${entry.did})`,
        400,
      );
    }
    const sig = decodeBase64OrThrow(entry.signature, `signature[${entry.did}]`);
    const result = await provider.verify(bytes, sig, publicKey);
    if (!result.valid) {
      throw new ColberError(
        ERROR_CODES.INVALID_SIGNATURE,
        `Settlement signature verification failed for did=${entry.did}: ${result.reason ?? 'unknown'}`,
        400,
      );
    }
  }
};
