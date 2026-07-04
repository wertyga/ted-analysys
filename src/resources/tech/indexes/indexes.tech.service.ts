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
});

@Injectable()
export class IndexesTechService {
  private status = emptySyncIndexesStatus();

  getSyncIndexesStatus(): SyncIndexesStatus {
    return {
      ...this.status,
      errors: [...this.status.errors],
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
          await mongoose.model(modelName).createIndexes();
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
}
