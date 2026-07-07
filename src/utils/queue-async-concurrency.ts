export type QueueAsyncTask<T> = () => Promise<T> | T;

interface QueueItem<T> {
  task: QueueAsyncTask<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class QueueAsyncConcurrency {
  private readonly queue: QueueItem<unknown>[] = [];
  private runningCount = 0;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly concurrency = 1) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('QueueAsyncConcurrency concurrency must be >= 1');
    }
  }

  get running(): number {
    return this.runningCount;
  }

  get concurrencyLimit(): number {
    return this.concurrency;
  }

  get pending(): number {
    return this.queue.length;
  }

  get size(): number {
    return this.runningCount + this.queue.length;
  }

  push<T>(task: QueueAsyncTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task: task as QueueAsyncTask<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.drain();
    });
  }

  onIdle(): Promise<void> {
    if (this.size === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private drain(): void {
    while (this.runningCount < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();

      if (!item) {
        continue;
      }

      this.runningCount += 1;
      this.runItem(item);
    }
  }

  private async runItem(item: QueueItem<unknown>): Promise<void> {
    try {
      item.resolve(await item.task());
    } catch (error: unknown) {
      item.reject(error);
    } finally {
      this.runningCount -= 1;
      this.resolveIdleIfNeeded();
      this.drain();
    }
  }

  private resolveIdleIfNeeded(): void {
    if (this.size > 0) {
      return;
    }

    const resolvers = this.idleResolvers.splice(0);

    resolvers.forEach((resolve) => resolve());
  }
}
