import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import { readStringArray } from '@/utils';
import { Contractor, ContractorDocument, ContractorModel } from './schemas';

export interface ContractorNormalized {
  winnerName?: unknown;
  winnerIdentifier?: unknown;
  winnerCountry?: unknown;
  winnerCountrySub?: unknown;
  winnerCity?: unknown;
  winnerPostCode?: unknown;
  winnerSize?: unknown;
  winnerListed?: unknown;
  winnerInternetAddress?: unknown;
  winnerEmail?: unknown;
}

@Injectable()
export class ContractorService {
  async upsertAwardWinners(
    contractorNormalized: ContractorNormalized,
  ): Promise<ContractorDocument[]> {
    const winners = this.buildAwardTenderWinners(contractorNormalized);

    const savedWinners = await Promise.all(
      winners.map((winner) => {
        const filter = winner.identifier
          ? { identifier: winner.identifier }
          : {
              name: winner.name,
              country: winner.country,
              city: winner.city,
            };

        return ContractorModel.findOneAndUpdate(
          filter,
          { $set: winner },
          { returnDocument: 'after', upsert: true },
        ).exec();
      }),
    );

    return savedWinners;
  }

  buildAwardTenderWinners({
    winnerName,
    winnerIdentifier,
    winnerCountry,
    winnerCountrySub,
    winnerCity,
    winnerPostCode,
    winnerSize,
    winnerListed,
    winnerInternetAddress,
    winnerEmail,
  }: ContractorNormalized): Contractor[] {
    const names = this.readWinnerStringArray(winnerName);
    const identifiers = this.readWinnerStringArray(winnerIdentifier);
    const countries = this.readWinnerStringArray(winnerCountry);
    const countrySubs = this.readWinnerStringArray(winnerCountrySub);
    const cities = this.readWinnerStringArray(winnerCity);
    const postCodes = this.readWinnerStringArray(winnerPostCode);
    const sizes = this.readWinnerStringArray(winnerSize);
    const listed = this.readWinnerStringArray(winnerListed);
    const internetAddresses = this.readWinnerStringArray(winnerInternetAddress);
    const emails = this.readWinnerStringArray(winnerEmail);
    const winnersCount = Math.max(
      names.length,
      identifiers.length,
      countries.length,
      countrySubs.length,
      cities.length,
      postCodes.length,
      sizes.length,
      listed.length,
      internetAddresses.length,
      emails.length,
    );

    return Array.from({ length: winnersCount })
      .map(
        (_, index): Contractor => ({
          name: names[index],
          identifier: identifiers[index],
          country: countries[index],
          countrySub: countrySubs[index],
          city: cities[index],
          postCode: postCodes[index],
          size: sizes[index],
          listed: listed[index],
          internetAddress: internetAddresses[index],
          email: emails[index],
        }),
      )
      .filter((winner) =>
        [
          winner.name,
          winner.identifier,
          winner.country,
          winner.countrySub,
          winner.city,
          winner.postCode,
          winner.size,
        ].some((value) => value !== undefined),
      );
  }

  private readWinnerStringArray(value: unknown): string[] {
    return readStringArray(Array.isArray(value) ? value : [value]);
  }
}
