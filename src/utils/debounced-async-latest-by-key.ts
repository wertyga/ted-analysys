export type DebouncedAsyncLatestRunner<TKey, TInput, TResult> = (
  input: TInput,
  key: TKey,
) => Promise<TResult> | TResult;

interface DebouncedAsyncLatestEntry<TInput, TResult> {
  input: TInput;
  timer?: ReturnType<typeof setTimeout>;
  promise: Promise<TResult>;
  resolve: (value: TResult) => void;
  reject: (reason: unknown) => void;
}

export class DebouncedAsyncLatestByKey<TKey, TInput, TResult> {
  private readonly entries = new Map<
    TKey,
    DebouncedAsyncLatestEntry<TInput, TResult>
  >();

  constructor(
    private readonly delayMs: number,
    private readonly runner: DebouncedAsyncLatestRunner<TKey, TInput, TResult>,
  ) {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error('DebouncedAsyncLatestByKey delayMs must be >= 0');
    }
  }

  run(key: TKey, input: TInput): Promise<TResult> {
    const existing = this.entries.get(key);

    if (existing) {
      existing.input = input;
      this.schedule(key, existing);

      return existing.promise;
    }

    let resolvePromise!: (value: TResult) => void;
    let rejectPromise!: (reason: unknown) => void;
    const promise = new Promise<TResult>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const entry: DebouncedAsyncLatestEntry<TInput, TResult> = {
      input,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
    };

    this.entries.set(key, entry);
    this.schedule(key, entry);

    return promise;
  }

  cancel(key: TKey, reason: unknown = new Error('Debounced task canceled')) {
    const entry = this.entries.get(key);

    if (!entry) {
      return;
    }

    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    this.entries.delete(key);
    entry.reject(reason);
  }

  private schedule(
    key: TKey,
    entry: DebouncedAsyncLatestEntry<TInput, TResult>,
  ): void {
    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    entry.timer = setTimeout(() => this.flush(key, entry), this.delayMs);
  }

  private async flush(
    key: TKey,
    entry: DebouncedAsyncLatestEntry<TInput, TResult>,
  ): Promise<void> {
    entry.timer = undefined;

    if (this.entries.get(key) !== entry) {
      return;
    }

    this.entries.delete(key);

    try {
      entry.resolve(await this.runner(entry.input, key));
    } catch (error: unknown) {
      entry.reject(error);
    }
  }
}
