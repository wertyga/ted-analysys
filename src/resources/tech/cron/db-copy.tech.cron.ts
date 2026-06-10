import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CdnFile, CdnService } from '@/cdn';

const DEFAULT_DB_COPY_CRON = '0 4 * * *';
const DEFAULT_DB_COPY_MAX_COPIES = 10;

type DumpFile = {
  filename: string;
  mtimeMs: number;
};

export type DatabaseDumpCopyResult = {
  filename: string;
  url: string;
  deletedCount: number;
};

@Injectable()
export class DbCopyTechCron {
  private readonly logger = new Logger(DbCopyTechCron.name);
  private readonly cdnService = new CdnService();
  private isRunning = false;

  @Cron(DEFAULT_DB_COPY_CRON, {
    timeZone: 'Europe/Warsaw',
  })
  async copyDatabaseDumpToCdnCron() {
    if (!process.env.DB_COPY_ENABLED) {
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Database dump copy is already running, skipping');
      return;
    }

    const cdnPrefix = process.env.DB_COPY_CDN_PREFIX || '/db-dumps';

    if (!process.env.DNS_STORAGE || !process.env.DNS_PASSWORD) {
      this.logger.warn('CDN env is not configured, skipping DB copy');
      return;
    }

    this.isRunning = true;

    try {
      await this.copyDatabaseDumpToCdnUnsafe();
    } catch (error: unknown) {
      this.logger.error(
        `Database dump copy failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  async copyDatabaseDumpToCdn(): Promise<DatabaseDumpCopyResult> {
    if (this.isRunning) {
      throw new Error('Database dump copy is already running');
    }

    this.isRunning = true;

    try {
      return await this.copyDatabaseDumpToCdnUnsafe();
    } finally {
      this.isRunning = false;
    }
  }

  private async copyDatabaseDumpToCdnUnsafe(): Promise<DatabaseDumpCopyResult> {
    const cdnPrefix = process.env.DB_COPY_CDN_PREFIX || '/db-dumps';
    const dbName = process.env.DB_NAME;

    if (!dbName) {
      throw new Error('DB_NAME is not configured');
    }

    if (!process.env.DNS_STORAGE || !process.env.DNS_PASSWORD) {
      throw new Error('CDN env is not configured');
    }

    const date = new Date().toISOString().slice(0, 10);
    const filename = `${dbName}-${date}.archive.gz`;
    const tempDir = await mkdtemp(join(tmpdir(), 'ted-db-dump-'));
    const tempOutputPath = join(tempDir, filename);
    const mongoUri = `mongodb://127.0.0.1/${dbName}`;

    try {
      await this.runMongoDump(mongoUri, tempOutputPath);
      const buffer = await readFile(tempOutputPath);

      const url = await this.cdnService.uploadFromBuffer(
        buffer,
        filename,
        cdnPrefix,
      );
      const deletedCount = await this.pruneOldCopies(cdnPrefix, dbName);

      this.logger.log(`Database dump copied to CDN: ${filename}`);

      return {
        filename,
        url,
        deletedCount,
      };
    } catch (error) {
      await unlink(tempOutputPath).catch(() => undefined);
      throw error;
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private async runMongoDump(mongoUri: string, outputPath: string) {
    const args = ['--uri', mongoUri, '--archive=' + outputPath, '--gzip'];

    await new Promise<void>((resolve, reject) => {
      const child = spawn('mongodump', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `mongodump exited with code ${code}${
              stderr ? `: ${stderr.trim()}` : ''
            }`,
          ),
        );
      });
    });
  }

  private async pruneOldCopies(cdnPrefix: string, dbName: string) {
    const maxCopies = Number(
      process.env.DB_COPY_MAX_COPIES || DEFAULT_DB_COPY_MAX_COPIES,
    );
    const files = await this.getDumpFiles(cdnPrefix, dbName);
    const filesToDelete = files
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(maxCopies);

    await Promise.all(
      filesToDelete.map((file) =>
        this.cdnService.deleteFileFromCdn({
          filenameOrFilePath: file.filename,
          prefixFolder: cdnPrefix,
        }),
      ),
    );

    return filesToDelete.length;
  }

  private async getDumpFiles(
    cdnPrefix: string,
    dbName: string,
  ): Promise<DumpFile[]> {
    const files = await this.cdnService.listFiles(cdnPrefix);

    return files
      .filter((file) => {
        return (
          file.ObjectName.startsWith(`${dbName}-`) &&
          /\.archive\.gz$/i.test(file.ObjectName)
        );
      })
      .map((file) => ({
        filename: file.ObjectName,
        mtimeMs: this.getCdnFileTime(file),
      }));
  }

  private getCdnFileTime(file: CdnFile) {
    const date = file.LastChanged || file.DateCreated;
    const time = date ? new Date(date).getTime() : 0;

    return Number.isFinite(time) ? time : 0;
  }
}
