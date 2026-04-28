/**
 * Generic time + size based batcher.
 *
 * Used by the ingestion service to gather log + span events into a single
 * `INSERT INTO praxis_logs / praxis_spans` write — ClickHouse strongly
 * prefers fewer, larger inserts (it's an LSM-style merger; tiny inserts
 * trigger expensive merges).
 *
 * Two flush triggers:
 *   1. SIZE — once the queue holds at least `batchSize` items, flush.
 *   2. TIME — once `intervalMs` ms have elapsed since the last flush
 *             AND the queue is non-empty, flush.
 *
 * Failure semantics: if the underlying flush throws, the in-flight batch is
 * discarded. Re-queuing on failure is intentionally NOT done at this layer
 * — the call site decides whether to retry, drop, or DLQ. (The CDC §4.6
 * SLO is "P95 ack 100 ms" which is met before the flush; loss on flush
 * failure is acceptable for v1.)
 */

export interface BatcherOptions<T> {
  readonly batchSize: number;
  readonly intervalMs: number;
  readonly flush: (batch: readonly T[]) => Promise<void>;
  /** Optional logger for diagnostics. */
  readonly onError?: (err: unknown, droppedBatchSize: number) => void;
  /** Schedules a one-shot timer. Override in tests. */
  readonly scheduleTimer?: (handler: () => void, ms: number) => () => void;
}

const defaultScheduleTimer = (handler: () => void, ms: number): (() => void) => {
  const t = setTimeout(handler, ms);
  // node-typed timers expose unref to avoid keeping the event loop alive
  // beyond the user-installed handlers. Best-effort.
  if (typeof (t as unknown as { unref?: () => void }).unref === 'function') {
    (t as unknown as { unref: () => void }).unref();
  }
  return () => clearTimeout(t);
};

export class Batcher<T> {
  private queue: T[] = [];
  private cancelTimer: (() => void) | null = null;
  private inFlight: Promise<void> | null = null;
  private closed = false;

  constructor(private readonly opts: BatcherOptions<T>) {
    if (opts.batchSize < 1) {
      throw new Error('batchSize must be >= 1');
    }
    if (opts.intervalMs < 1) {
      throw new Error('intervalMs must be >= 1');
    }
  }

  /** Number of buffered items not yet flushed. */
  public get size(): number {
    return this.queue.length;
  }

  /**
   * Add one item. If the queue reaches `batchSize`, kicks off a flush
   * synchronously and returns the resulting promise. Otherwise schedules a
   * timer (idempotently) so the buffered items get flushed within `intervalMs`.
   */
  public add(item: T): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('Batcher is closed'));
    }
    this.queue.push(item);
    if (this.queue.length >= this.opts.batchSize) {
      return this.flushNow();
    }
    this.armTimer();
    return Promise.resolve();
  }

  /**
   * Add many items at once. Flushes once at the end (greedy — won't trigger
   * intermediate flushes even if the queue exceeds `batchSize` partway
   * through). The whole batch is one `INSERT` to ClickHouse when possible.
   */
  public addMany(items: readonly T[]): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('Batcher is closed'));
    }
    if (items.length === 0) {
      return Promise.resolve();
    }
    for (const item of items) {
      this.queue.push(item);
    }
    if (this.queue.length >= this.opts.batchSize) {
      return this.flushNow();
    }
    this.armTimer();
    return Promise.resolve();
  }

  /** Force-flush whatever is buffered. Resolves once the flush completes. */
  public async flushNow(): Promise<void> {
    this.disarmTimer();
    if (this.queue.length === 0) {
      // If a flush is already in flight, callers wait for it.
      if (this.inFlight) {
        await this.inFlight;
      }
      return;
    }
    const batch = this.queue;
    this.queue = [];
    const flushed = this.opts.flush(batch).catch((err: unknown) => {
      if (this.opts.onError) {
        this.opts.onError(err, batch.length);
      } else {
        // Rethrow to surface in unit tests when no `onError` is configured.
        throw err;
      }
    });
    this.inFlight = flushed.finally(() => {
      if (this.inFlight === flushed) {
        this.inFlight = null;
      }
    });
    await this.inFlight;
  }

  /**
   * Stop accepting new items, flush whatever is buffered, then resolve.
   * Idempotent.
   */
  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.disarmTimer();
    await this.flushNow();
  }

  private armTimer(): void {
    if (this.cancelTimer || this.queue.length === 0) {
      return;
    }
    const schedule = this.opts.scheduleTimer ?? defaultScheduleTimer;
    this.cancelTimer = schedule(() => {
      this.cancelTimer = null;
      // Fire-and-forget; errors land in `onError` if configured.
      void this.flushNow();
    }, this.opts.intervalMs);
  }

  private disarmTimer(): void {
    if (this.cancelTimer) {
      this.cancelTimer();
      this.cancelTimer = null;
    }
  }
}
