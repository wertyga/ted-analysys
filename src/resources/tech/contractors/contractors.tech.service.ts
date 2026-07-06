import { Injectable } from '@nestjs/common';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { basename, dirname, isAbsolute, join, normalize } from 'path';
import { randomInt } from 'crypto';
import {
  ContractorDocument,
  ContractorModel,
} from '@/resources/contractor/schemas';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { ContractorService } from '@/resources/contractor/contractor.service';

type ContractorCsvRow = {
  email?: string;
  name?: string;
  country?: string;
  cpv?: string[];
  contractsWon?: number;
  lastContractWon?: Date;
};

const CONTRACTORS_CSV_CHUNK_SIZE = 1000;
const COUPON_LENGTH = 12;

type ExistingContractorCsvValues = {
  emails: Set<string>;
  coupons: Set<string>;
};

type ContractorCompressGroup = {
  email: string;
  contractors: ContractorDocument[];
};

type AwardTenderCpvProjection = {
  _id: unknown;
  winners?: unknown[];
  cpvCodes?: string[];
};

export type RefreshContractorStatsStatus = {
  isRunning: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  totalContractors: number;
  processedContractors: number;
  updatedContractors: number;
  errors: number;
  failedChunks: number;
};

const emptyRefreshContractorStatsStatus = (): RefreshContractorStatsStatus => ({
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  totalContractors: 0,
  processedContractors: 0,
  updatedContractors: 0,
  errors: 0,
  failedChunks: 0,
});

@Injectable()
export class ContractorsTechService {
  private refreshContractorStatsStatus = emptyRefreshContractorStatsStatus();

  constructor(private readonly contractorService: ContractorService) {}

  getRefreshContractorStatsStatus(): RefreshContractorStatsStatus {
    return { ...this.refreshContractorStatsStatus };
  }

  startRefreshContractorStats(): RefreshContractorStatsStatus {
    if (this.refreshContractorStatsStatus.isRunning) {
      return this.getRefreshContractorStatsStatus();
    }

    void this.refreshContractorStats();

    return this.getRefreshContractorStatsStatus();
  }

  async refreshContractorStats(): Promise<RefreshContractorStatsStatus> {
    if (this.refreshContractorStatsStatus.isRunning) {
      return this.getRefreshContractorStatsStatus();
    }

    this.refreshContractorStatsStatus = {
      ...emptyRefreshContractorStatsStatus(),
      isRunning: true,
      startedAt: new Date(),
    };
    const status = this.refreshContractorStatsStatus;

    try {
      const contractorIds = await this.getAwardTenderContractorIds();
      status.totalContractors = contractorIds.length;

      const chunkedIds = this.chunkRows(contractorIds, 100);

      for (const chunk of chunkedIds) {
        try {
          await this.contractorService.refreshContractorsAwardMeta(chunk);
          status.updatedContractors += chunk.length;
        } catch (error) {
          status.failedChunks += 1;
          status.errors += chunk.length;
        } finally {
          status.processedContractors += chunk.length;
        }
      }
    } catch (error) {
      status.lastError =
        error instanceof Error ? error.message : 'Unknown error';
    } finally {
      status.isRunning = false;
      status.finishedAt = new Date();
    }

    return this.getRefreshContractorStatsStatus();
  }

  async compressContractors() {
    const contractors = await ContractorModel.find({
      'emails.0': { $exists: true },
    });

    const awardTenders = await AwardTenderModel.find({})
      .select('_id winners cpvCodes')
      .lean<AwardTenderCpvProjection[]>();
    const awardTendersByWinnerId =
      this.groupAwardTendersByWinnerId(awardTenders);

    const contractorGroups = this.groupContractorsByEmail(contractors);

    let deletedCount = 0;
    let updatedAwardTendersCount = 0;

    for (const { email, contractors } of contractorGroups) {
      const [canonicalContractor, ...duplicateContractors] = contractors;
      const contractorIds = contractors.map((contractor) => contractor._id);
      const duplicateIds = duplicateContractors.map(
        (contractor) => contractor._id,
      );
      const contractorAwardTenders = this.getAwardTendersForContractors(
        awardTendersByWinnerId,
        contractorIds,
      );

      await ContractorModel.findByIdAndUpdate(canonicalContractor._id, {
        $set: {
          ...this.buildCompressedContractor(
            contractors,
            contractorAwardTenders,
          ),
          emails: [email],
        },
      });

      if (duplicateIds.length === 0) {
        continue;
      }

      const updateAwardTendersResult = await AwardTenderModel.updateMany(
        { winners: { $in: duplicateIds } },
        [
          {
            $set: {
              winners: {
                $setUnion: [
                  { $setDifference: ['$winners', duplicateIds] },
                  [canonicalContractor._id],
                ],
              },
              lots: {
                $map: {
                  input: '$lots',
                  as: 'lot',
                  in: {
                    $cond: [
                      { $in: ['$$lot.winner', duplicateIds] },
                      {
                        $mergeObjects: [
                          '$$lot',
                          { winner: canonicalContractor._id },
                        ],
                      },
                      '$$lot',
                    ],
                  },
                },
              },
            },
          },
        ],
        { updatePipeline: true },
      );
      const deleteResult = await ContractorModel.deleteMany({
        _id: { $in: duplicateIds },
      });

      updatedAwardTendersCount += updateAwardTendersResult.modifiedCount;
      deletedCount += deleteResult.deletedCount;
    }

    return {
      emailsCount: contractorGroups.length,
      duplicateEmailsCount: contractorGroups.filter(
        ({ contractors }) => contractors.length > 1,
      ).length,
      contractorsCount: contractors.length,
      deletedCount,
      updatedAwardTendersCount,
    };
  }

  async generateContractorsCsv() {
    const contractorsCsvDir = dirname(this.getContractorsCsvOutputPath());

    await mkdir(contractorsCsvDir, { recursive: true });

    const existingCsvValues =
      await this.getExistingContractorCsvValues(contractorsCsvDir);

    const rows = await this.getContractorRows(existingCsvValues.emails);
    const rowsByCountry = this.groupRowsByCountry(rows);
    const usedCoupons = new Set(existingCsvValues.coupons);

    const outputPaths = (
      await Promise.all(
        Object.entries(rowsByCountry).map(async ([country, countryRows]) => {
          const baseOutputPath = this.getContractorsCsvOutputPath(country);
          const rowChunks = this.chunkRows(
            countryRows,
            CONTRACTORS_CSV_CHUNK_SIZE,
          );

          await mkdir(dirname(baseOutputPath), { recursive: true });

          return Promise.all(
            rowChunks.map(async (chunk, index) => {
              const outputPath = this.getContractorsCsvOutputPath(
                country,
                `${index + 1}`,
              );
              const csv = this.buildContractorsCsv(chunk, usedCoupons);

              await writeFile(outputPath, csv, 'utf8');
              return outputPath;
            }),
          );
        }),
      )
    ).flat();

    const chunksCountByCountry = Object.fromEntries(
      Object.entries(rowsByCountry).map(([country, countryRows]) => [
        country,
        this.chunkRows(countryRows, CONTRACTORS_CSV_CHUNK_SIZE).length,
      ]),
    );
    const rowsCountByCountry = Object.fromEntries(
      Object.entries(rowsByCountry).map(([country, countryRows]) => [
        country,
        countryRows.length,
      ]),
    );

    return {
      outputPaths,
      filenames: outputPaths.map((outputPath) => basename(outputPath)),
      rowsCount: rows.length,
      rowsCountByCountry,
      skippedExistingEmailsCount: existingCsvValues.emails.size,
      chunksCount: outputPaths.length,
      chunksCountByCountry,
    };
  }

  private groupRowsByCountry(rows: ContractorCsvRow[]) {
    return rows.reduce<Record<string, ContractorCsvRow[]>>((acc, row) => {
      if (!row.country) {
        return acc;
      }

      acc[row.country] = [...(acc[row.country] ?? []), row];

      return acc;
    }, {});
  }

  getContractorsCsvOutputPath(country?: string, postfix?: string) {
    const configuredPath = `contractors/contractors${country ? `_${country}` : ''}${postfix ? `_${postfix}` : ''}.csv`;

    if (isAbsolute(configuredPath)) {
      return normalize(configuredPath);
    }

    return join(process.cwd(), configuredPath);
  }

  async getContractorRows(
    excludeEmails: Set<string> = new Set(),
  ): Promise<ContractorCsvRow[]> {
    const contractors = await ContractorModel.find({}).then((contractors) => {
      const contractorByEmail = contractors
        .filter((contractor) => !!this.getContractorEmail(contractor))
        .reduce<Record<string, ContractorDocument>>((acc, contractor) => {
          const email = this.getContractorEmail(contractor);

          if (!email || excludeEmails.has(email)) {
            return acc;
          }

          acc[email] = contractor;

          return acc;
        }, {});

      return Object.values(contractorByEmail).filter(
        (contractor) => !!contractor.countries?.[0] && !!contractor.name,
      );
    });

    return Object.values(contractors).map((contractor) => ({
      email: this.getContractorEmail(contractor),
      name: contractor.name,
      country: contractor.countries?.[0],
      cpv: contractor.cpvCodes,
    }));
  }

  private async getExistingContractorCsvValues(
    csvDir: string,
  ): Promise<ExistingContractorCsvValues> {
    const emails = new Set<string>();
    const coupons = new Set<string>();
    let filenames: string[];

    try {
      filenames = await readdir(csvDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { emails, coupons };
      }

      throw error;
    }

    await Promise.all(
      filenames
        .filter((filename) => filename.toLowerCase().endsWith('.csv'))
        .map(async (filename) => {
          const csv = await readFile(join(csvDir, filename), 'utf8');

          for (const line of csv.split(/\r?\n/).slice(1)) {
            const email = this.normalizeEmail(this.getCsvCell(line, 0));
            const coupon = this.normalizeCoupon(this.getCsvCell(line, 3));

            if (email) {
              emails.add(email);
            }

            if (coupon) {
              coupons.add(coupon);
            }
          }
        }),
    );

    return { emails, coupons };
  }

  private getCsvCell(line: string, cellIndex: number) {
    if (!line) {
      return '';
    }

    let currentCellIndex = 0;
    let inQuotes = false;
    let value = '';

    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (inQuotes && char === '"' && nextChar === '"') {
        value += '"';
        index++;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && char === ',') {
        if (currentCellIndex === cellIndex) {
          return value;
        }

        currentCellIndex++;
        value = '';
        continue;
      }

      value += char;
    }

    return currentCellIndex === cellIndex ? value : '';
  }

  private chunkRows<T>(rows: T[], chunkSize: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < rows.length; index += chunkSize) {
      chunks.push(rows.slice(index, index + chunkSize));
    }

    return chunks;
  }

  private async deleteUnused() {
    const [allContractorIds, tenderWinnerIds, lotWinnerIds] = await Promise.all(
      [
        ContractorModel.find({}).select('_id').lean(),
        AwardTenderModel.distinct('winners'),
        AwardTenderModel.distinct('lots.winner'),
      ],
    );

    const usedIds = new Set(
      [...tenderWinnerIds, ...lotWinnerIds]
        .filter(Boolean)
        .map((id) => id.toString()),
    );

    const unusedIds = allContractorIds
      .map((contractor) => contractor._id.toString())
      .filter((id) => !usedIds.has(id));

    await ContractorModel.updateMany(
      { _id: { $in: unusedIds as any } },
      {
        $unset: {
          cpvCodes: '',
          stats: '',
        },
      },
    );
  }

  private async getAwardTenderContractorIds(): Promise<string[]> {
    const [winnerIds, lotWinnerIds] = await Promise.all([
      AwardTenderModel.distinct('winners'),
      AwardTenderModel.distinct('lots.winner'),
    ]);

    return Array.from(
      new Set(
        [...winnerIds, ...lotWinnerIds]
          .map((id) => this.toIdString(id))
          .filter(Boolean),
      ),
    );
  }

  private normalizeEmail(email?: string) {
    return email?.trim().toLowerCase() ?? '';
  }

  private getContractorEmail(contractor: ContractorDocument) {
    return this.normalizeEmail(contractor.emails?.[0]);
  }

  private normalizeCoupon(coupon?: string) {
    return coupon?.trim().toUpperCase() ?? '';
  }

  private groupContractorsByEmail(
    contractors: ContractorDocument[],
  ): ContractorCompressGroup[] {
    const contractorByEmail = contractors.reduce<
      Record<string, ContractorDocument[]>
    >((acc, contractor) => {
      const email = this.getContractorEmail(contractor);

      if (!email) {
        return acc;
      }

      acc[email] = [...(acc[email] ?? []), contractor];

      return acc;
    }, {});

    return Object.entries(contractorByEmail).map(([email, contractors]) => ({
      email,
      contractors,
    }));
  }

  private buildCompressedContractor(
    contractors: ContractorDocument[],
    awardTenders: AwardTenderCpvProjection[],
  ) {
    const countries = this.uniqueContractorValues(contractors, 'countries');
    const internetAddresses = this.uniqueContractorValues(
      contractors,
      'internetAddresses',
    );
    const postCodes = this.uniqueContractorValues(contractors, 'postCodes');
    const cities = this.uniqueContractorValues(contractors, 'cities');
    const countrySubs = this.uniqueContractorValues(contractors, 'countrySubs');

    return {
      name: this.firstContractorValue(contractors, 'name'),
      identifiers: this.firstContractorValue(contractors, 'identifiers'),
      countries,
      countrySubs,
      cities,
      postCodes,
      size: this.firstContractorValue(contractors, 'size'),
      listed: this.firstContractorValue(contractors, 'listed'),
      internetAddresses,
      cpvCodes: this.uniqueCpvCodes(contractors, awardTenders),
    };
  }

  private firstContractorValue(
    contractors: ContractorDocument[],
    field: keyof ContractorDocument,
  ) {
    return contractors
      .map((contractor) => contractor[field])
      .find((value) => typeof value === 'string' && value.trim());
  }

  private uniqueContractorValues(
    contractors: ContractorDocument[],
    arrayField: keyof ContractorDocument,
  ) {
    return Array.from(
      new Set(
        contractors.flatMap((contractor) =>
          this.toStringArray(contractor[arrayField]),
        ),
      ),
    );
  }

  private uniqueCpvCodes(
    contractors: ContractorDocument[],
    awardTenders: AwardTenderCpvProjection[],
  ) {
    return Array.from(
      new Set([
        ...contractors.flatMap((contractor) =>
          this.toStringArray(contractor.cpvCodes),
        ),
        ...awardTenders.flatMap((awardTender) =>
          this.toStringArray(awardTender.cpvCodes),
        ),
      ]),
    );
  }

  private groupAwardTendersByWinnerId(
    awardTenders: AwardTenderCpvProjection[],
  ) {
    const awardTendersByWinnerId = new Map<
      string,
      AwardTenderCpvProjection[]
    >();

    for (const awardTender of awardTenders) {
      for (const winnerId of awardTender.winners ?? []) {
        const key = this.toIdString(winnerId);

        if (!key) {
          continue;
        }

        awardTendersByWinnerId.set(key, [
          ...(awardTendersByWinnerId.get(key) ?? []),
          awardTender,
        ]);
      }
    }

    return awardTendersByWinnerId;
  }

  private getAwardTendersForContractors(
    awardTendersByWinnerId: Map<string, AwardTenderCpvProjection[]>,
    contractorIds: unknown[],
  ) {
    const awardTendersById = new Map<string, AwardTenderCpvProjection>();

    for (const contractorId of contractorIds) {
      const key = this.toIdString(contractorId);

      for (const awardTender of awardTendersByWinnerId.get(key) ?? []) {
        const awardTenderId = this.toIdString(awardTender._id);

        if (awardTenderId) {
          awardTendersById.set(awardTenderId, awardTender);
        }
      }
    }

    return Array.from(awardTendersById.values());
  }

  private toIdString(value: unknown) {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'object' && 'toString' in value) {
      return value.toString();
    }

    return '';
  }

  private toStringArray(value: unknown) {
    return (Array.isArray(value) ? value : [value])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private getTimestampPostfix() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  }

  private buildContractorsCsv(
    rows: ContractorCsvRow[],
    usedCoupons: Set<string>,
  ) {
    const header = [
      'EMAIL',
      'COMPANY',
      'COUNTRY',
      'COUPON',
      // 'CPV',
      // 'CONTRACTS_WON',
      // 'LAST_CONTRACT_WON',
    ];
    const lines = rows.map((row) =>
      [
        row.email,
        row.name,
        row.country,
        this.generateUniqueCoupon(usedCoupons),
        // row.cpv,
        // row.contractsWon,
        // this.formatCsvDate(row.lastContractWon),
      ]
        .map((value) => this.escapeCsvCell(value))
        .join(','),
    );

    return `${header.join(',')}\n${lines.join('\n')}\n`;
  }

  private generateUniqueCoupon(usedCoupons: Set<string>) {
    let coupon = this.generateRandomCoupon();

    while (usedCoupons.has(coupon)) {
      coupon = this.generateRandomCoupon();
    }

    usedCoupons.add(coupon);

    return coupon;
  }

  private generateRandomCoupon() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    return Array.from({ length: COUPON_LENGTH }, () => {
      return alphabet[randomInt(alphabet.length)];
    }).join('');
  }

  private formatCsvDate(value?: Date) {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }

  private escapeCsvCell(value: unknown) {
    const text = value === undefined || value === null ? '' : String(value);

    if (!/[",\r\n]/.test(text)) {
      return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
  }
}
