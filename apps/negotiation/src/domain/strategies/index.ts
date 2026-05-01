import { ERROR_CODES, ColberError } from '@colber/core-types';

import { AscendingAuctionStrategy } from './ascending-auction.js';
import { MultiCriteriaStrategy } from './multi-criteria.js';

import type { Strategy } from '../negotiation-types.js';
import type { NegotiationStrategy } from './strategy.js';

export { AscendingAuctionStrategy } from './ascending-auction.js';
export { MultiCriteriaStrategy } from './multi-criteria.js';
export type {
  NegotiationStrategy,
  ProposalRejection,
  ProposalValidation,
  ProposalValidationResult,
} from './strategy.js';

const ASCENDING = new AscendingAuctionStrategy();
const MULTI_CRITERIA = new MultiCriteriaStrategy();

/** Resolve a strategy id to its singleton implementation. */
export const getStrategy = (id: Strategy): NegotiationStrategy => {
  switch (id) {
    case 'ascending-auction':
      return ASCENDING;
    case 'multi-criteria':
      return MULTI_CRITERIA;
    default: {
      // Exhaustive — TS narrows `id` to `never` here.
      const _exhaustive: never = id;
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `Unknown strategy: ${String(_exhaustive)}`,
        400,
      );
    }
  }
};
