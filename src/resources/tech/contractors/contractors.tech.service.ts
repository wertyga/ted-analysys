import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { basename, dirname, isAbsolute, join, normalize } from 'path';
import { ContractorModel } from '@/resources/contractor/schemas';
import { AwardTenderModel } from '@/resources/award-tender/schemas';

type ContractorCsvRow = {
  email?: string;
  company?: string;
  country?: string;
  cpv?: string[];
  contractsWon: number;
  lastContractWon?: Date;
};

@Injectable()
export class ContractorsTechService {
  async generateContractorsCsv() {
    const outputPath = this.getContractorsCsvOutputPath();
    const [rows, contractorsCount] = await Promise.all([
      this.getContractorRows(),
      ContractorModel.countDocuments().exec(),
    ]);
    const csv = this.buildContractorsCsv(rows);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, csv, 'utf8');

    return {
      outputPath,
      filename: basename(outputPath),
      rowsCount: rows.length,
      contractorsCount,
    };
  }

  getContractorsCsvOutputPath() {
    const configuredPath = 'contractors/contractors.csv';

    if (isAbsolute(configuredPath)) {
      return normalize(configuredPath);
    }

    return join(process.cwd(), configuredPath);
  }

  async getContractorRows(): Promise<ContractorCsvRow[]> {
    const contractors = await ContractorModel.find({
      email: {
        $exists: true,
        $ne: null,
      },
    }).limit(100);

    const data: ContractorCsvRow[] = [];

    await Promise.all(
      contractors.map((c) => {
        return AwardTenderModel.find({ winners: c._id }).then((tenders) => {
          data.push({
            email: c.email,
            company: c.name,
            contractsWon: tenders.length,
            country: c.country,
            cpv: tenders.flatMap((t) => t.cpvCodes).filter(Boolean) as string[],
            lastContractWon: tenders.sort(
              (a, b) =>
                new Date(b.publicationDate ?? 0).getTime() -
                new Date(a.publicationDate ?? 0).getTime(),
            )[0]?.publicationDate,
          });
        });
      }),
    );

    return data;
  }

  private buildContractorsCsv(rows: ContractorCsvRow[]) {
    const header = [
      'EMAIL',
      'COMPANY',
      'COUNTRY',
      'CPV',
      'CONTRACTS_WON',
      'LAST_CONTRACT_WON',
    ];
    const lines = rows.map((row) =>
      [
        row.email,
        row.company,
        row.country,
        row.cpv,
        row.contractsWon,
        this.formatCsvDate(row.lastContractWon),
      ]
        .map((value) => this.escapeCsvCell(value))
        .join(','),
    );

    return `${header.join(',')}\n${lines.join('\n')}\n`;
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
