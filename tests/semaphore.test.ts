import { describe, expect, it } from 'vitest';

import { Semaphore } from '../src/shared/http/semaphore.js';

describe('Semaphore', () => {
  it('never runs more tasks than the limit and runs all of them', async () => {
    const semaphore = new Semaphore(2);
    let active = 0;
    let peak = 0;

    const results = await Promise.all(
      Array.from({ length: 6 }, (_value, index) =>
        semaphore.run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return index;
        }),
      ),
    );

    expect(peak).toBe(2);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('releases the slot when a task fails', async () => {
    const semaphore = new Semaphore(1);

    await expect(
      semaphore.run(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    await expect(semaphore.run(async () => 'next')).resolves.toBe('next');
  });

  it.each([0, -1, 1.5])('rejects limit %s', (limit) => {
    expect(() => new Semaphore(limit)).toThrow(RangeError);
  });
});
