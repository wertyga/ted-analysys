import { Injectable } from '@nestjs/common';
import { readStringArray } from '@/utils';
import { Contractor, ContractorDocument, ContractorModel } from './schemas';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { QueryFilter } from 'mongoose';

export interface ContractorNormalized {
  winnerName: string[];
  winnerIdentifier: string[];
  winnerCountry: string[];
  winnerCountrySub: string[];
  winnerCity: string[];
  winnerPostCode: string[];
  winnerSize: string[];
  winnerListed: string[];
  winnerInternetAddress: string[];
  winnerEmail: string[];
}

export interface UpsertAwardWinnersOptions {
  awardTenderId: unknown;
  cpvCodes: string[];
}

type AwardWinnerContractor = Pick<
  Contractor,
  'name' | 'identifier' | 'size' | 'listed' | 'email'
> & {
  country?: string;
  countrySub?: string;
  city?: string;
  postCode?: string;
  internetAddress?: string;
};

@Injectable()
export class ContractorService {
  async upsertListAwardWinners(
    contractorNormalized: ContractorNormalized,
    options: UpsertAwardWinnersOptions,
  ): Promise<ContractorDocument[]> {
    const winners = this.buildAwardTenderWinners(contractorNormalized);

    return Promise.all(
      winners.map((winner) => this.upsertAwardWinner(winner, options)),
    );
  }

  private async upsertAwardWinner(
    winner: AwardWinnerContractor,
    options: UpsertAwardWinnersOptions,
  ) {
    const email = this.normalizeEmail(winner.email);
    const identityFilter = this.buildWinnerIdentityFilter({ ...winner, email });
    const existingContractors = await ContractorModel.find(identityFilter).sort(
      {
        createdAt: 1,
        _id: 1,
      },
    );
    const [canonicalContractor, ...duplicateContractors] = existingContractors;
    const update = this.buildWinnerUpdate(
      { ...winner, email },
      options,
      canonicalContractor,
    );

    if (duplicateContractors.length > 0) {
      await this.mergeDuplicateContractors(
        canonicalContractor,
        duplicateContractors,
      );
    }

    return ContractorModel.findOneAndUpdate(
      canonicalContractor ? { _id: canonicalContractor._id } : identityFilter,
      update,
      { returnDocument: 'after', upsert: true },
    )
      .orFail()
      .exec();
  }

  private buildWinnerIdentityFilter(
    winner: AwardWinnerContractor,
  ): QueryFilter<ContractorDocument> {
    const filters: QueryFilter<ContractorDocument>[] = [];

    if (winner.email) {
      filters.push({ email: winner.email });
    }

    if (winner.identifier) {
      filters.push({ identifier: winner.identifier });
    }

    if (filters.length === 0) {
      return {
        name: winner.name,
        countries: winner.country,
        cities: winner.city,
      };
    }

    return filters.length === 1 ? filters[0] : { $or: filters };
  }

  private buildWinnerUpdate(
    winner: AwardWinnerContractor,
    { awardTenderId, cpvCodes }: UpsertAwardWinnersOptions,
    existingContractor?: ContractorDocument,
  ) {
    const $set = this.pickDefinedStrings({
      name: winner.name,
      size: winner.size,
      listed: winner.listed,
      identifier:
        !existingContractor?.identifier ||
        existingContractor.identifier === winner.identifier
          ? winner.identifier
          : undefined,
      email:
        !existingContractor?.email || existingContractor.email === winner.email
          ? winner.email
          : undefined,
    });
    const $addToSet = this.pickAddToSet({
      countries: winner.country,
      countrySubs: winner.countrySub,
      cities: winner.city,
      postCodes: winner.postCode,
      internetAddresses: winner.internetAddress,
      awardTenders: awardTenderId,
      cpvCodes: cpvCodes?.filter(Boolean),
    });

    return {
      ...(Object.keys($set).length > 0 ? { $set } : {}),
      ...(Object.keys($addToSet).length > 0 ? { $addToSet } : {}),
    };
  }

  private async mergeDuplicateContractors(
    canonicalContractor: ContractorDocument,
    duplicateContractors: ContractorDocument[],
  ) {
    const duplicateIds = duplicateContractors.map(
      (contractor) => contractor._id,
    );
    const duplicateAwardTenders = await AwardTenderModel.find({
      winners: { $in: duplicateIds },
    })
      .select('_id cpvCodes')
      .lean();
    const duplicateMergeUpdate = this.buildDuplicateContractorsMergeUpdate(
      duplicateContractors,
      duplicateAwardTenders.map((awardTender) => awardTender._id),
      duplicateAwardTenders.flatMap(
        (awardTender) => awardTender.cpvCodes ?? [],
      ),
    );

    if (Object.keys(duplicateMergeUpdate).length > 0) {
      await ContractorModel.findByIdAndUpdate(
        canonicalContractor._id,
        duplicateMergeUpdate,
      );
    }

    await AwardTenderModel.updateMany(
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
          },
        },
      ],
      { updatePipeline: true },
    );

    await ContractorModel.deleteMany({ _id: { $in: duplicateIds } });
  }

  private buildDuplicateContractorsMergeUpdate(
    duplicateContractors: ContractorDocument[],
    awardTenderIds: unknown[],
    cpvCodes: string[],
  ) {
    const $addToSet = this.pickAddToSet({
      countries: duplicateContractors.flatMap((contractor) => [
        ...(contractor.countries ?? []),
      ]),
      countrySubs: duplicateContractors.flatMap((contractor) => [
        ...(contractor.countrySubs ?? []),
      ]),
      cities: duplicateContractors.flatMap((contractor) => [
        ...(contractor.cities ?? []),
      ]),
      postCodes: duplicateContractors.flatMap((contractor) => [
        ...(contractor.postCodes ?? []),
      ]),
      internetAddresses: duplicateContractors.flatMap((contractor) => [
        ...(contractor.internetAddresses ?? []),
      ]),
      cpvCodes: duplicateContractors.flatMap((contractor) => [
        ...(contractor.cpvCodes ?? []),
        ...cpvCodes,
      ]),
      awardTenders: duplicateContractors.flatMap((contractor) => [
        ...(contractor.awardTenders ?? []),
        ...awardTenderIds,
      ]),
    });

    return Object.keys($addToSet).length > 0 ? { $addToSet } : {};
  }

  private pickDefinedStrings(values: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(values).filter(([, value]) => {
        return typeof value === 'string' && value.trim();
      }),
    );
  }

  private pickAddToSet(values: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(values)
        .map(([field, value]) => {
          const values = this.toAddToSetArray(value);

          if (values.length === 0) {
            return null;
          }

          return [field, { $each: values }];
        })
        .filter((entry): entry is [string, { $each: unknown[] }] => {
          return entry !== null;
        }),
    );
  }

  private normalizeEmail(email?: string) {
    return email?.trim().toLowerCase() ?? '';
  }

  private toAddToSetArray(value: unknown) {
    return (Array.isArray(value) ? value : [value])
      .map((value) => (typeof value === 'string' ? value.trim() : value))
      .filter((value) => {
        return value !== undefined && value !== null && value !== '';
      });
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
  }: ContractorNormalized): AwardWinnerContractor[] {
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
        (_, index): AwardWinnerContractor => ({
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
          winner.listed,
          winner.internetAddress,
          winner.email,
        ].some((value) => value !== undefined),
      );
  }

  private readWinnerStringArray(value: unknown): string[] {
    return readStringArray(Array.isArray(value) ? value : [value]);
  }
}
