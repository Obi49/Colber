/**
 * Nominal/branded primitives.
 *
 * TypeScript is structurally typed — `Brand` lets us tag a primitive
 * with a unique symbol so the compiler distinguishes (e.g.) `AgentId`
 * from a plain `string` at call sites.
 */

declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Returns the inner primitive of a branded type. Pure runtime no-op. */
export const unbrand = <T, B extends string>(value: Brand<T, B>): T => value;
