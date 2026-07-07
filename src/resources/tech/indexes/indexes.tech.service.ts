import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';

export type SyncIndexesStatus = {
  isRunning: boolean;
  mode: 'ensure' | 'rebuild';
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  totalModels: number;
  processedModels: number;
  currentModel: string | null;
  indexesChecked: number;
  indexesCreated: number;
  indexesAlreadyPresent: number;
  indexesRebuilt: number;
  errors: Array<{
    model: string;
    message: string;
  }>;
  rebuiltIndexes: Array<{
    model: string;
    index: string;
  }>;
  droppedConflictingIndexes: Array<{
    model: string;
    index: string;
  }>;
};

const emptySyncIndexesStatus = (): SyncIndexesStatus => ({
  isRunning: false,
  mode: 'ensure',
  startedAt: null,
  finishedAt: null,
  lastError: null,
  totalModels: 0,
  processedModels: 0,
  currentModel: null,
  indexesChecked: 0,
  indexesCreated: 0,
  indexesAlreadyPresent: 0,
  indexesRebuilt: 0,
  errors: [],
  rebuiltIndexes: [],
  droppedConflictingIndexes: [],
});

const LEGACY_INDEXES_TO_DROP: Record<string, Array<Record<string, 1 | -1>>> = {
  TenderGeneralAnalysis: [{ tender: 1 }],
};

@Injectable()
export class IndexesTechService {
  private status = emptySyncIndexesStatus();

  getSyncIndexesStatus(): SyncIndexesStatus {
    return {
      ...this.status,
      errors: [...this.status.errors],
      rebuiltIndexes: [...this.status.rebuiltIndexes],
      droppedConflictingIndexes: [...this.status.droppedConflictingIndexes],
    };
  }

  startSyncIndexes(forceRebuild = false): SyncIndexesStatus {
    if (this.status.isRunning) {
      return this.getSyncIndexesStatus();
    }

    void this.syncIndexes(forceRebuild);

    return this.getSyncIndexesStatus();
  }

  private async syncIndexes(forceRebuild: boolean): Promise<SyncIndexesStatus> {
    if (this.status.isRunning) {
      return this.getSyncIndexesStatus();
    }

    const modelNames = mongoose.modelNames().sort();

    this.status = {
      ...emptySyncIndexesStatus(),
      isRunning: true,
      mode: forceRebuild ? 'rebuild' : 'ensure',
      startedAt: new Date(),
      totalModels: modelNames.length,
    };

    const status = this.status;

    try {
      for (const modelName of modelNames) {
        status.currentModel = modelName;

        try {
          await this.dropLegacyIndexes(modelName, status);
          await this.createIndexesWithConflictRetry(
            modelName,
            status,
            forceRebuild,
          );
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
    forceRebuild: boolean,
  ): Promise<void> {
    const model = mongoose.model(modelName);
    const indexes = model.schema.indexes();

    for (const [fields, options] of indexes) {
      status.indexesChecked += 1;

      const existingIndexName = await this.getExistingIndexName(modelName, fields);

      if (forceRebuild && existingIndexName) {
        await model.collection.dropIndex(existingIndexName);
        status.indexesRebuilt += 1;
        status.rebuiltIndexes.push({
          model: modelName,
          index: existingIndexName,
        });
      }

      await this.createIndexWithConflictRetry(
        modelName,
        status,
        fields,
        options,
      );

      if (forceRebuild && existingIndexName) {
        continue;
      }

      if (existingIndexName) {
        status.indexesAlreadyPresent += 1;
      } else {
        status.indexesCreated += 1;
      }
    }
  }

  private async dropLegacyIndexes(
    modelName: string,
    status: SyncIndexesStatus,
  ): Promise<void> {
    const legacyIndexes = LEGACY_INDEXES_TO_DROP[modelName];

    if (!legacyIndexes?.length) {
      return;
    }

    const model = mongoose.model(modelName);
    const existingIndexes = await model.collection.indexes();

    for (const index of existingIndexes) {
      if (!index.name || index.name === '_id_') {
        continue;
      }

      const shouldDrop = legacyIndexes.some((legacyIndex) =>
        this.isSameIndexKey(index.key as Record<string, unknown>, legacyIndex),
      );

      if (!shouldDrop) {
        continue;
      }

      await model.collection.dropIndex(index.name);
      status.droppedConflictingIndexes.push({
        model: modelName,
        index: index.name,
      });
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

  private async getExistingIndexName(
    modelName: string,
    fields: Record<string, unknown>,
  ): Promise<string | null> {
    const model = mongoose.model(modelName);
    const existingIndexes = await model.collection.indexes();

    const existingIndex = existingIndexes.find(
      (index) =>
        index.name !== '_id_' &&
        this.isSameIndexKey(index.key as Record<string, unknown>, fields),
    );

    return existingIndex?.name ?? null;
  }

  private isSameIndexKey(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
  ): boolean {
    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);

    return (
      leftEntries.length === rightEntries.length &&
      leftEntries.every(([key, value]) => right[key] === value)
    );
  }
}
