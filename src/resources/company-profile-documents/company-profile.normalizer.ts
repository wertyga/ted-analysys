import { BadRequestException } from '@nestjs/common';
import {
  getNormalizedStringArray,
  getOptionalNonNegativeNumber,
  getOptionalPositiveNumber,
  getOptionalString,
  isRecord,
} from '@/utils';
import { CurrencySign } from '@/resources/codelist';
import { CompanyProfileAiResult } from './company-profile-documents.types';

/**
 * Normalizes the raw LLM company profile JSON. Shared by every profile
 * source (uploaded documents, company website) since they all ask the model
 * for the same shape.
 */
export const normalizeCompanyProfileAiResult = (
  value: unknown,
): CompanyProfileAiResult => {
  if (!isRecord(value)) {
    throw new BadRequestException(
      'AI profile extraction returned invalid JSON',
    );
  }

  return {
    companyName: getOptionalString(value.companyName),
    country: getOptionalString(value.country),
    operatingCountries: Array.from(
      new Set(getNormalizedStringArray(value.operatingCountries)),
    ),
    companySize: getOptionalPositiveNumber(value.companySize),
    summary: getOptionalString(value.summary),
    companyDescription: getOptionalString(value.companyDescription),
    industries: Array.from(new Set(getNormalizedStringArray(value.industries))),
    mainServices: Array.from(
      new Set(getNormalizedStringArray(value.mainServices)),
    ),
    languages: Array.from(
      new Set(getNormalizedStringArray(value.languages)),
    ).map((item) => item.toUpperCase()),
    minDaysBeforeDeadline: getOptionalNonNegativeNumber(
      value.minDaysBeforeDeadline,
    ),
    certifications: Array.from(
      new Set(getNormalizedStringArray(value.certifications)),
    ),
    capabilities: Array.from(
      new Set(getNormalizedStringArray(value.capabilities)),
    ),
    yearsOfExperience: getOptionalNonNegativeNumber(value.yearsOfExperience),
    publicProcurementExperience:
      typeof value.publicProcurementExperience === 'boolean'
        ? value.publicProcurementExperience
        : undefined,
    typicalContractSize: getTypicalContractSize(value.typicalContractSize),
  };
};

const getTypicalContractSize = (
  value: unknown,
): CompanyProfileAiResult['typicalContractSize'] | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const currency =
    typeof value.currency === 'string' &&
    Object.values(CurrencySign).includes(value.currency as CurrencySign)
      ? (value.currency as CurrencySign)
      : undefined;
  const result = {
    min: getOptionalNonNegativeNumber(value.min),
    max: getOptionalNonNegativeNumber(value.max),
    currency,
  };

  return result.min || result.max || result.currency ? result : undefined;
};
