/**
 * FIFO semaphore. Callers queue up and are admitted in arrival order, so with a
 * limit of 1 this is a plain serial queue.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  /** Number of callers currently blocked waiting for a slot. */
  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    // hand the slot straight to the next waiter instead of freeing it, so a
    // burst of callers can't overtake the queue
    if (next) next();
    else this.active--;
  }
}
