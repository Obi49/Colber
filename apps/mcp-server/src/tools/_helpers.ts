/**
 * Internal helpers shared across tool registrations.
 *
 * Not exported through `index.ts` — these are implementation details for the
 * tool layer only.
 */

/**
 * Type-level companion to `omitUndefined`: turns `T | undefined` properties
 * into truly optional ones (no `| undefined`), as required by the SDK's input
 * types under `exactOptionalPropertyTypes: true`.
 */
export type OmitUndefined<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
} & {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
};

/**
 * Strip keys whose value is `undefined`. Required because zod `.optional()`
 * produces `T | undefined`, but the SDK's input types use
 * `exactOptionalPropertyTypes: true` which forbids passing `undefined` to an
 * optional field. The double-cast bridges what TS can't infer about runtime
 * key presence.
 *
 * Shallow only — for nested optionals, call recursively at each layer.
 */
export const omitUndefined = <T extends Record<string, unknown>>(obj: T): OmitUndefined<T> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as OmitUndefined<T>;
};
