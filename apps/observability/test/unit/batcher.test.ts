import { describe, expect, it, vi } from 'vitest';

import { Batcher } from '../../src/domain/batcher.js';

interface Scheduler {
  schedule: (handler: () => void, ms: number) => () => void;
  fire: () => void;
  pending: () => boolean;
}

const manualScheduler = (): Scheduler => {
  let nextHandler: (() => void) | null = null;
  return {
    schedule(handler) {
      nextHandler = handler;
      return () => {
        if (nextHandler === handler) {
          nextHandler = null;
        }
      };
    },
    fire() {
      const h = nextHandler;
      if (h) {
        nextHandler = null;
        h();
      }
    },
    pending() {
      return nextHandler !== null;
    },
  };
};

describe('Batcher', () => {
  it('flushes when the size threshold is hit', async () => {
    const flush = vi.fn(() => Promise.resolve());
    const sched = manualScheduler();
    const b = new Batcher<number>({
      batchSize: 3,
      intervalMs: 1000,
      flush,
      scheduleTimer: sched.schedule,
    });
    await b.add(1);
    await b.add(2);
    expect(flush).not.toHaveBeenCalled();
    expect(sched.pending()).toBe(true);
    await b.add(3);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([1, 2, 3]);
    expect(sched.pending()).toBe(false);
  });

  it('flushes on the timer when below the size threshold', async () => {
    const flush = vi.fn(() => Promise.resolve());
    const sched = manualScheduler();
    const b = new Batcher<number>({
      batchSize: 100,
      intervalMs: 50,
      flush,
      scheduleTimer: sched.schedule,
    });
    await b.add(1);
    await b.add(2);
    expect(flush).not.toHaveBeenCalled();
    sched.fire();
    // Wait a microtask to let the async flush settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(flush).toHaveBeenCalledWith([1, 2]);
  });

  it('addMany triggers a single flush', async () => {
    const flush = vi.fn(() => Promise.resolve());
    const sched = manualScheduler();
    const b = new Batcher<number>({
      batchSize: 3,
      intervalMs: 1000,
      flush,
      scheduleTimer: sched.schedule,
    });
    await b.addMany([1, 2, 3, 4, 5]);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([1, 2, 3, 4, 5]);
  });

  it('flushNow drains the queue', async () => {
    const flush = vi.fn(() => Promise.resolve());
    const sched = manualScheduler();
    const b = new Batcher<number>({
      batchSize: 100,
      intervalMs: 5000,
      flush,
      scheduleTimer: sched.schedule,
    });
    await b.add(1);
    await b.add(2);
    await b.flushNow();
    expect(flush).toHaveBeenCalledWith([1, 2]);
    expect(b.size).toBe(0);
  });

  it('reports flush errors via onError without throwing to the caller', async () => {
    const onError = vi.fn();
    const sched = manualScheduler();
    const b = new Batcher<number>({
      batchSize: 1,
      intervalMs: 100,
      flush: () => Promise.reject(new Error('clickhouse down')),
      onError,
      scheduleTimer: sched.schedule,
    });
    await b.add(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1]).toBe(1);
  });

  it('refuses adds after close', async () => {
    const sched = manualScheduler();
    const b = new Batcher<number>({
      batchSize: 100,
      intervalMs: 100,
      flush: () => Promise.resolve(),
      scheduleTimer: sched.schedule,
    });
    await b.close();
    await expect(b.add(1)).rejects.toThrow(/closed/);
  });

  it('close flushes pending items', async () => {
    const flush = vi.fn(() => Promise.resolve());
    const sched = manualScheduler();
    const b = new Batcher<number>({
      batchSize: 100,
      intervalMs: 5000,
      flush,
      scheduleTimer: sched.schedule,
    });
    await b.add(1);
    await b.close();
    expect(flush).toHaveBeenCalledWith([1]);
  });

  it('rejects invalid options', () => {
    expect(
      () =>
        new Batcher<number>({
          batchSize: 0,
          intervalMs: 100,
          flush: () => Promise.resolve(),
        }),
    ).toThrow(/batchSize/);
    expect(
      () =>
        new Batcher<number>({
          batchSize: 1,
          intervalMs: 0,
          flush: () => Promise.resolve(),
        }),
    ).toThrow(/intervalMs/);
  });
});
