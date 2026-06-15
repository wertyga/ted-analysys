import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CronTaskQueueService {
  private readonly logger = new Logger(CronTaskQueueService.name);
  private tail: Promise<void> = Promise.resolve();
  private runningTaskName?: string;

  async runExclusive<T>(
    taskName: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.tail.catch(() => undefined);
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runningTaskName = this.runningTaskName;

    this.tail = previous.then(() => current);

    if (runningTaskName) {
      this.logger.warn(
        `${taskName} is waiting for cron task ${runningTaskName} to finish`,
      );
    }

    await previous;
    this.runningTaskName = taskName;

    try {
      return await task();
    } finally {
      this.runningTaskName = undefined;
      release();
    }
  }
}
