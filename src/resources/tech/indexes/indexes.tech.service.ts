import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import mongoose from 'mongoose';

export type IndexHealthIssue = {
  model: string;
  collection: string;
  index: string;
  unique: boolean;
  reason: string;
};

export type IndexHealthReport = {
  isRunning: boolean;
  trigger: 'startup' | 'sync' | null;
  checkedAt: Date | null;
  totalModels: number;
  indexesChecked: number;
  // Indexes declared in Mongoose schemas but absent in MongoDB.
  missing: IndexHealthIssue[];
  // Errors from automatic index builds at startup or from the check itself.
  errors: Array<{ model: string; message: string }>;
};

const emptyIndexHealthReport = (): IndexHealthReport => ({
  isRunning: false,
  trigger: null,
  checkedAt: null,
  totalModels: 0,
  indexesChecked: 0,
  missing: [],
  errors: [],
});

const MONGO_NAMESPACE_NOT_FOUND = 26;

// Index build running in MongoDB right now, whoever started it (Mongoose
// autoIndex on startup, sync-indexes, manual createIndex in mongosh).
export type IndexBuildProgress = {
  collection: string;
  indexes: string[];
  phase: string | null;
  done: number | null;
  total: number | null;
  percent: number | null;
  secondsRunning: number | null;
};

type CurrentOp = {
  ns?: string;
  msg?: string;
  secs_running?: number;
  progress?: { done?: number; total?: number };
  command?: {
    createIndexes?: string;
    indexes?: Array<{ name?: string; key?: Record<string, unknown> }>;
  };
};

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
  AwardTender: [{ winners: 1 }, { leadBuyers: 1 }, { nonLeadBuyers: 1 }],
  Tender: [{ leadBuyers: 1 }, { nonLeadBuyers: 1 }],
};

@Injectable()
export class IndexesTechService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IndexesTechService.name);
  private status = emptySyncIndexesStatus();
  private health = emptyIndexHealthReport();

  onApplicationBootstrap(): void {
    // Mongoose builds indexes on startup but only emits failures on the model
    // (e.g. a unique index blocked by duplicates), so nobody notices. Check
    // in the background and surface the result in logs and the admin panel.
    void this.runIndexHealthCheck('startup');
  }

  async getIndexHealth(): Promise<
    IndexHealthReport & { builds: IndexBuildProgress[] }
  > {
    return {
      ...this.health,
      missing: [...this.health.missing],
      errors: [...this.health.errors],
      builds: await this.getIndexBuilds(),
    };
  }

  private async getIndexBuilds(): Promise<IndexBuildProgress[]> {
    const db = mongoose.connection.db;

    if (!db) {
      return [];
    }

    let ops: CurrentOp[];

    try {
      const result = (await db.admin().command({
        currentOp: 1,
        'command.createIndexes': { $exists: true },
        ns: { $regex: `^${db.databaseName}\\.` },
      })) as { inprog?: CurrentOp[] };
      ops = result.inprog ?? [];
    } catch (error) {
      this.logger.warn(
        `Cannot read index builds from currentOp: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }

    // The client createIndexes call and the server build thread are separate
    // ops for the same build; keep one per collection + indexes, preferring
    // the one that reports progress.
    const builds = new Map<string, IndexBuildProgress>();

    for (const op of ops) {
      const collection = op.command?.createIndexes;

      if (!collection) {
        continue;
      }

      const indexes = (op.command?.indexes ?? []).map(
        (index) => index.name ?? this.getGeneratedIndexName(index.key ?? {}),
      );
      const key = `${collection}|${indexes.join(',')}`;
      const done = op.progress?.done ?? null;
      const total = op.progress?.total ?? null;
      const build: IndexBuildProgress = {
        collection,
        indexes,
        // e.g. "Index Build: scanning collection Index Build: scanning collection: 1/2 50%"
        phase:
          op.msg?.match(/Index Build: ([a-z ]+?)(?= Index Build|:|$)/i)?.[1] ??
          null,
        done,
        total,
        percent:
          done !== null && total ? Math.floor((done / total) * 100) : null,
        secondsRunning: op.secs_running ?? null,
      };

      const existing = builds.get(key);

      if (!existing || (existing.total === null && build.total !== null)) {
        builds.set(key, build);
      }
    }

    return [...builds.values()];
  }

  private async runIndexHealthCheck(
    trigger: 'startup' | 'sync',
  ): Promise<void> {
    if (this.health.isRunning) {
      return;
    }

    const modelNames = mongoose.modelNames().sort();
    const report: IndexHealthReport = {
      ...emptyIndexHealthReport(),
      isRunning: true,
      trigger,
      totalModels: modelNames.length,
    };
    this.health = report;

    for (const modelName of modelNames) {
      const model = mongoose.model(modelName);
      let buildError: string | null = null;

      // The startup build result is cached in model.init(); after a manual
      // sync it is stale, so only consult it on the startup check.
      if (trigger === 'startup') {
        try {
          await model.init();
        } catch (error) {
          buildError = error instanceof Error ? error.message : String(error);
          report.errors.push({ model: modelName, message: buildError });
          this.logger.error(
            `Automatic index build failed for ${modelName}: ${buildError}`,
          );
        }
      }

      try {
        const existingIndexes = await this.getCollectionIndexes(modelName);

        if (!existingIndexes) {
          continue;
        }

        for (const [fields, options] of model.schema.indexes()) {
          report.indexesChecked += 1;

          const exists = existingIndexes.some((index) =>
            this.isSameIndexKey(index.key as Record<string, unknown>, fields),
          );

          if (exists) {
            continue;
          }

          const issue: IndexHealthIssue = {
            model: modelName,
            collection: model.collection.collectionName,
            index: this.getGeneratedIndexName(fields),
            unique: options?.unique === true,
            reason: buildError ?? 'Declared in schema but missing in MongoDB',
          };
          report.missing.push(issue);
          this.logger.error(
            `Missing Mongo index ${issue.collection}.${issue.index}` +
              `${issue.unique ? ' (unique)' : ''}: ${issue.reason}`,
          );
        }
      } catch (error) {
        report.errors.push({
          model: modelName,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    report.isRunning = false;
    report.checkedAt = new Date();

    if (report.missing.length || report.errors.length) {
      this.logger.warn(
        `Mongo index check (${trigger}): ${report.missing.length} missing, ` +
          `${report.errors.length} errors. See /adm/tech/sync-indexes/health`,
      );
    } else {
      this.logger.log(
        `Mongo index check (${trigger}): all ${report.indexesChecked} indexes present`,
      );
    }
  }

  private async getCollectionIndexes(
    modelName: string,
  ): Promise<Array<{ key: unknown }> | null> {
    try {
      return await mongoose.model(modelName).collection.indexes();
    } catch (error) {
      // Collection not created yet: no data, nothing to index.
      if ((error as { code?: number })?.code === MONGO_NAMESPACE_NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

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

    await this.runIndexHealthCheck('sync');

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
