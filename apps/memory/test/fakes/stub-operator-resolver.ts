import type { OperatorResolver } from '../../src/domain/operator-resolver.js';

/**
 * Test stub for `OperatorResolver`. By default, returns `null` (operator
 * unknown). Tests can preload mappings via `setOperator` to exercise the
 * `operator`-visibility code path.
 */
export class StubOperatorResolver implements OperatorResolver {
  private readonly mapping = new Map<string, string>();

  public setOperator(did: string, operatorId: string): void {
    this.mapping.set(did, operatorId);
  }

  public clear(): void {
    this.mapping.clear();
  }

  public async resolveOperatorId(agentDid: string): Promise<string | null> {
    return Promise.resolve(this.mapping.get(agentDid) ?? null);
  }
}
