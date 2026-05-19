import {
  DebouncedAsyncLatestByKey,
  DebouncedAsyncLatestRunner,
} from './debounced-async-latest-by-key';
import { QueueAsyncConcurrency } from './queue-async-concurrency';

export interface DebouncedAsyncLatestQueueByKeyOptions<
  TKey,
  TInput,
  TResult,
> {
  delayMs: number;
  concurrency?: number;
  runner: DebouncedAsyncLatestRunner<TKey, TInput, TResult>;
}

export class DebouncedAsyncLatestQueueByKey<TKey, TInput, TResult> {
  private readonly queue: QueueAsyncConcurrency;
  private readonly debounced: DebouncedAsyncLatestByKey<TKey, TInput, TResult>;

  constructor(
    options: DebouncedAsyncLatestQueueByKeyOptions<TKey, TInput, TResult>,
  ) {
    this.queue = new QueueAsyncConcurrency(options.concurrency ?? 1);
    this.debounced = new DebouncedAsyncLatestByKey(
      options.delayMs,
      (input, key) => this.queue.push(() => options.runner(input, key)),
    );
  }

  get running(): number {
    return this.queue.running;
  }

  get pending(): number {
    return this.queue.pending;
  }

  get size(): number {
    return this.queue.size;
  }

  run(key: TKey, input: TInput): Promise<TResult> {
    return this.debounced.run(key, input);
  }

  cancel(key: TKey, reason?: unknown): void {
    this.debounced.cancel(key, reason);
  }

  onIdle(): Promise<void> {
    return this.queue.onIdle();
  }
}
