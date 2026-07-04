import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';

export type SyncIndexesStatus = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  totalModels: number;
  processedModels: number;
  currentModel: string | null;
  errors: Array<{
    model: string;
    message: string;
  }>;
  droppedConflictingIndexes: Array<{
    model: string;
    index: string;
  }>;
};

const emptySyncIndexesStatus = (): SyncIndexesStatus => ({
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  totalModels: 0,
  processedModels: 0,
  currentModel: null,
  errors: [],
  droppedConflictingIndexes: [],
});

@Injectable()
export class IndexesTechService {
  private status = emptySyncIndexesStatus();

  getSyncIndexesStatus(): SyncIndexesStatus {
    return {
      ...this.status,
      errors: [...this.status.errors],
      droppedConflictingIndexes: [...this.status.droppedConflictingIndexes],
    };
  }

  startSyncIndexes(): SyncIndexesStatus {
    if (this.status.isRunning) {
      return this.getSyncIndexesStatus();
    }

    void this.syncIndexes();

    return this.getSyncIndexesStatus();
  }

  private async syncIndexes(): Promise<SyncIndexesStatus> {
    if (this.status.isRunning) {
      return this.getSyncIndexesStatus();
    }

    const modelNames = mongoose.modelNames().sort();

    this.status = {
      ...emptySyncIndexesStatus(),
      isRunning: true,
      startedAt: new Date(),
      totalModels: modelNames.length,
    };

    const status = this.status;

    try {
      for (const modelName of modelNames) {
        status.currentModel = modelName;

        try {
          await this.createIndexesWithConflictRetry(modelName, status);
        } catch (error) {
          status.errors.push({
            model: modelName,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        } finally {
          status.processedModels += 1;
        }
      }
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      status.isRunning = false;
      status.currentModel = null;
      status.finishedAt = new Date();
    }

    return this.getSyncIndexesStatus();
  }

  private async createIndexesWithConflictRetry(
    modelName: string,
    status: SyncIndexesStatus,
  ): Promise<void> {
    const model = mongoose.model(modelName);
    const indexes = model.schema.indexes();

    for (const [fields, options] of indexes) {
      await this.createIndexWithConflictRetry(
        modelName,
        status,
        fields,
        options,
      );
    }
  }

  private async createIndexWithConflictRetry(
    modelName: string,
    status: SyncIndexesStatus,
    fields: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<void> {
    const model = mongoose.model(modelName);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await model.collection.createIndex(fields as never, options);
        return;
      } catch (error) {
        const sameNameConflictIndex = this.getSameNameConflictingIndexName(error);

        if (sameNameConflictIndex && sameNameConflictIndex !== '_id_') {
          await model.collection.dropIndex(sameNameConflictIndex);
          status.droppedConflictingIndexes.push({
            model: modelName,
            index: sameNameConflictIndex,
          });
          continue;
        }

        const differentNameConflictIndex =
          this.getDifferentNameConflictingIndexName(error);

        if (!differentNameConflictIndex || differentNameConflictIndex === '_id_') {
          throw error;
        }

        if (typeof options.name !== 'string') {
          return;
        }

        await model.collection.dropIndex(differentNameConflictIndex);
        status.droppedConflictingIndexes.push({
          model: modelName,
          index: differentNameConflictIndex,
        });
      }
    }

    throw new Error(
      `Too many conflicting index retries for ${modelName}.${String(
        options.name ?? this.getGeneratedIndexName(fields),
      )}`,
    );
  }

  private getSameNameConflictingIndexName(error: unknown): string | null {
    const message = error instanceof Error ? error.message : String(error);

    if (
      !message.includes('An existing index has the same name as the requested index')
    ) {
      return null;
    }

    return message.match(/Requested index:[\s\S]*?name: "([^"]+)"/)?.[1] ?? null;
  }

  private getDifferentNameConflictingIndexName(error: unknown): string | null {
    const message = error instanceof Error ? error.message : String(error);

    return (
      message.match(/Index already exists with a different name: ([^\s]+)/)?.[1] ??
      null
    );
  }

  private getGeneratedIndexName(fields: Record<string, unknown>): string {
    return Object.entries(fields)
      .map(([key, value]) => `${key}_${String(value)}`)
      .join('_');
  }
}
