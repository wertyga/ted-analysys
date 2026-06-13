import { Injectable } from '@nestjs/common';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { basename, dirname, isAbsolute, join, normalize } from 'path';
import { randomInt } from 'crypto';
import {
  ContractorDocument,
  ContractorModel,
} from '@/resources/contractor/schemas';

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

@Injectable()
export class ContractorsTechService {
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
        .filter((contractor) => !!contractor.email)
        .reduce<Record<string, ContractorDocument>>((acc, contractor) => {
          const email = this.normalizeEmail(contractor.email);

          if (!email || excludeEmails.has(email)) {
            return acc;
          }

          acc[email] = contractor;

          return acc;
        }, {});

      return Object.values(contractorByEmail).filter(
        (contractor) => !!contractor.country && !!contractor.name,
      );
    });

    return Object.values(contractors);
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

  private normalizeEmail(email?: string) {
    return email?.trim().toLowerCase() ?? '';
  }

  private normalizeCoupon(coupon?: string) {
    return coupon?.trim().toUpperCase() ?? '';
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
