/**
 * Alert rule DSL.
 *
 * Alert rules are declarative: a list of filters combined by AND/OR plus a
 * sliding-window count threshold. Evaluation is OUT OF SCOPE for this sprint
 * (planned for sprint 12) — this service stores rules only.
 *
 * Example:
 *   {
 *     operator: 'and',
 *     filters: [
 *       { field: 'service', op: 'eq', value: 'reputation' },
 *       { field: 'level', op: 'in', value: ['error', 'fatal'] }
 *     ],
 *     windowSeconds: 60,
 *     threshold: 5
 *   }
 *   // => "fire if 5 or more error/fatal logs from `reputation` in 60 s".
 */

export const ALERT_SCOPES = ['logs', 'spans'] as const;
export type AlertScope = (typeof ALERT_SCOPES)[number];

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'in',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'matches',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export type FilterValue = string | number | boolean | readonly (string | number)[];

export interface AlertFilter {
  /**
   * Allowed: top-level fields (`service`, `level`, `agentDid`, `operatorId`,
   * `status`, `durationMs`, `kind`, `name`, `message`) and nested attribute
   * keys via the `attributes.<key>` prefix.
   */
  readonly field: string;
  readonly op: FilterOperator;
  readonly value: FilterValue;
}

export type AlertCombinator = 'and' | 'or';

export interface AlertCondition {
  readonly operator: AlertCombinator;
  readonly filters: readonly AlertFilter[];
  /** Sliding-window length (seconds) over which `threshold` is evaluated. */
  readonly windowSeconds: number;
  /** Fire when the count of matching events in the window is >= threshold. */
  readonly threshold: number;
}

export type NotificationChannel =
  | { readonly type: 'webhook'; readonly url: string }
  | { readonly type: 'slack'; readonly channel: string }
  | { readonly type: 'email'; readonly recipients: readonly string[] };

export interface NotificationConfig {
  readonly channels: readonly NotificationChannel[];
}

export interface AlertRule {
  readonly id: string;
  readonly ownerOperatorId: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly scope: AlertScope;
  readonly condition: AlertCondition;
  readonly cooldownSeconds: number;
  readonly notification: NotificationConfig;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
