/**
 * On-chain settlement adapter — placeholder.
 *
 * Out of scope for v1. The current settlement path uses N parallel Ed25519
 * signatures from each party (see `signing.ts`), recorded inline in the
 * `negotiation.settled` event payload. There is NO on-chain contract write.
 *
 * P3 (post-MVP) plan, captured here so the path is obvious:
 *   - Define an EIP-712 typed-data schema mirroring the JCS payload signed
 *     today (`{ negotiationId, winningProposalId }`).
 *   - Add a viem-based signer + Base Sepolia RPC wiring under
 *     `apps/negotiation/src/chain/`.
 *   - Push a Merkle root of settled negotiations to a small registry
 *     contract on Base Sepolia (mirroring `merkle_anchors` in
 *     `apps/reputation`).
 *
 * Until then, this module is intentionally empty. Importing it should be a
 * no-op so callers that wire the registry in advance don't break.
 */

// TODO(P3): EIP-712 + Base Sepolia anchor. See header above.
export const ON_CHAIN_SETTLEMENT_ENABLED = false as const;
