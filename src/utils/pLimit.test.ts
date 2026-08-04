import { describe, expect, it } from 'vitest';
import { pLimit } from './pLimit';

describe('pLimit', () => {
  it('limits concurrency to the specified number', async () => {
    const limiter = pLimit(2);
    let active = 0;
    let maxActive = 0;

    const task = () =>
      limiter(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
      });

    await Promise.all(Array.from({ length: 6 }, task));
    expect(maxActive).toBe(2);
  });

  it('preserves return values and order-agnostic resolution', async () => {
    const limiter = pLimit(3);
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => limiter(async () => n * 10)),
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('propagates rejection without blocking remaining tasks', async () => {
    const limiter = pLimit(1);
    const task = (n: number) =>
      limiter(async () => {
        if (n === 2) throw new Error('boom');
        return n;
      });
    const results = await Promise.allSettled([1, 2, 3].map(task));
    expect((results[0] as PromiseFulfilledResult<number>).value).toBe(1);
    expect(results[1].status).toBe('rejected');
    expect((results[2] as PromiseFulfilledResult<number>).value).toBe(3);
  });

  it('concurrency 1 serializes execution', async () => {
    const limiter = pLimit(1);
    const order: number[] = [];
    const task = (n: number) =>
      limiter(async () => {
        order.push(n);
        await new Promise((r) => setTimeout(r, 10));
      });
    await Promise.all([1, 2, 3].map(task));
    expect(order).toEqual([1, 2, 3]);
  });
});
