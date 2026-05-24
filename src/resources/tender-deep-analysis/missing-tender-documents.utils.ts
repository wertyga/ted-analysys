import {
  MissingTenderDocument,
  MissingTenderDocumentImportance,
  MissingTenderDocumentStatus,
  MissingTenderDocumentType,
} from '@/types';
import { isRecord } from '@/utils';

export function normalizeMissingDocuments(
  missingDocuments: unknown,
  context: {
    portalUrls: string[];
    directFileUrls: string[];
    analyzedDocumentNames: string[];
  },
): MissingTenderDocument[] {
  const items = Array.isArray(missingDocuments)
    ? missingDocuments
    : typeof missingDocuments === 'string' && missingDocuments.trim()
      ? [missingDocuments]
      : [];

  return items
    .map((item) => normalizeMissingDocumentItem(item, context))
    .filter((item): item is MissingTenderDocument => item !== null);
}

export function collectTenderDocumentAccessUrls(tender: unknown): {
  portalUrls: string[];
  directFileUrls: string[];
} {
  const directFileUrls: string[] = [];
  const portalUrls: string[] = [];

  collectUrlsFromValue(getRecordValue(tender, 'documentUrls')).forEach((url) =>
    pushUrl(url, directFileUrls, portalUrls, true),
  );
  collectUrlsFromValue(getRecordValue(tender, 'submissionUrls')).forEach(
    (url) => pushUrl(url, directFileUrls, portalUrls, false),
  );
  collectUrlsFromValue(getRecordValue(tender, 'documentAccess')).forEach(
    (url) => pushUrl(url, directFileUrls, portalUrls, true),
  );

  return {
    portalUrls: uniqueUrls(portalUrls),
    directFileUrls: uniqueUrls(directFileUrls),
  };
}

export function collectAnalyzedDocumentNames(input: {
  documentMetadata?: unknown[];
  documentTextSnippets?: unknown[];
}): string[] {
  return uniqueStrings([
    ...collectNames(input.documentMetadata),
    ...collectNames(input.documentTextSnippets),
  ]);
}

export function isDirectFileUrl(url: string): boolean {
  return /\.(pdf|doc|docx|xls|xlsx|zip|rar|7z|txt|xml)(\?|#|$)/i.test(url);
}

function normalizeMissingDocumentItem(
  item: unknown,
  context: {
    portalUrls: string[];
    directFileUrls: string[];
    analyzedDocumentNames: string[];
  },
): MissingTenderDocument | null {
  const input = isRecord(item) ? item : undefined;
  const name = getString(input?.name) ?? (typeof item === 'string' ? item : '');
  const trimmedName = name.trim();

  if (!trimmedName) {
    return null;
  }

  const type = normalizeDocumentType(input?.type, trimmedName);
  const directDownloadUrl =
    getDirectUrl(input?.directDownloadUrl, context.directFileUrls) ??
    findMatchingUrl(trimmedName, context.directFileUrls);
  const isAlreadyAnalyzed = containsSimilarName(
    context.analyzedDocumentNames,
    trimmedName,
  );
  const status = normalizeDocumentStatus(
    input?.status,
    isAlreadyAnalyzed,
    directDownloadUrl,
    context.portalUrls,
  );
  const portalUrl =
    status === MissingTenderDocumentStatus.PORTAL_LINK_AVAILABLE
      ? (getUrl(input?.portalUrl) ?? context.portalUrls[0] ?? null)
      : null;
  const possibleUrls = uniqueUrls([
    ...(directDownloadUrl ? [directDownloadUrl] : []),
    ...context.portalUrls,
    ...collectUrlsFromValue(input?.possibleUrls),
  ]);

  return {
    name: trimmedName,
    type,
    importance: normalizeImportance(input?.importance, type),
    status,
    description: getString(input?.description) ?? '',
    whyNeeded: getString(input?.whyNeeded) ?? '',
    impactIfMissing: getString(input?.impactIfMissing) ?? '',
    sourceEvidence: getString(input?.sourceEvidence) ?? null,
    portalUrl,
    directDownloadUrl,
    possibleUrls,
    recommendedAction: getString(input?.recommendedAction) ?? '',
  };
}

function normalizeDocumentType(
  value: unknown,
  name: string,
): MissingTenderDocumentType {
  if (
    typeof value === 'string' &&
    Object.values(MissingTenderDocumentType).includes(
      value as MissingTenderDocumentType,
    )
  ) {
    return value as MissingTenderDocumentType;
  }

  const normalized = normalizeText(name);

  if (normalized.includes('swz')) {
    return MissingTenderDocumentType.SWZ;
  }
  if (
    normalized.includes('kosztorys') ||
    normalized.includes('cost') ||
    normalized.includes('price')
  ) {
    return MissingTenderDocumentType.PRICE_FORM;
  }
  if (
    normalized.includes('opis przedmiotu') ||
    normalized.includes('opz') ||
    normalized.includes('technical')
  ) {
    return MissingTenderDocumentType.TECHNICAL_SPECIFICATION;
  }
  if (normalized.includes('umowa') || normalized.includes('contract')) {
    return MissingTenderDocumentType.CONTRACT_DRAFT;
  }
  if (normalized.includes('zalacznik') || normalized.includes('annex')) {
    return MissingTenderDocumentType.CONTRACT_ANNEX;
  }

  return MissingTenderDocumentType.OTHER;
}

function normalizeImportance(
  value: unknown,
  type: MissingTenderDocumentType,
): MissingTenderDocumentImportance {
  if (
    typeof value === 'string' &&
    Object.values(MissingTenderDocumentImportance).includes(
      value as MissingTenderDocumentImportance,
    )
  ) {
    return value as MissingTenderDocumentImportance;
  }

  switch (type) {
    case MissingTenderDocumentType.SWZ:
    case MissingTenderDocumentType.TECHNICAL_SPECIFICATION:
      return MissingTenderDocumentImportance.CRITICAL;
    case MissingTenderDocumentType.PRICE_FORM:
    case MissingTenderDocumentType.CONTRACT_DRAFT:
      return MissingTenderDocumentImportance.HIGH;
    default:
      return MissingTenderDocumentImportance.MEDIUM;
  }
}

function normalizeDocumentStatus(
  value: unknown,
  isAlreadyAnalyzed: boolean,
  directDownloadUrl: string | null,
  portalUrls: string[],
): MissingTenderDocumentStatus {
  if (isAlreadyAnalyzed) {
    return MissingTenderDocumentStatus.ALREADY_ANALYZED;
  }
  if (directDownloadUrl) {
    return MissingTenderDocumentStatus.DIRECT_LINK_AVAILABLE;
  }
  if (portalUrls.length > 0) {
    return MissingTenderDocumentStatus.PORTAL_LINK_AVAILABLE;
  }
  if (
    typeof value === 'string' &&
    Object.values(MissingTenderDocumentStatus).includes(
      value as MissingTenderDocumentStatus,
    )
  ) {
    return value as MissingTenderDocumentStatus;
  }

  return MissingTenderDocumentStatus.MISSING;
}

function getDirectUrl(value: unknown, directFileUrls: string[]): string | null {
  const url = getUrl(value);

  if (!url || !directFileUrls.includes(url)) {
    return null;
  }

  return url;
}

function findMatchingUrl(name: string, urls: string[]): string | null {
  const normalizedName = normalizeText(name);

  return (
    urls.find((url) => {
      const normalizedUrl = normalizeText(decodeURIComponentSafe(url));

      return normalizedName
        .split(' ')
        .filter((part) => part.length >= 4)
        .some((part) => normalizedUrl.includes(part));
    }) ?? null
  );
}

function containsSimilarName(names: string[], target: string): boolean {
  const normalizedTarget = normalizeText(target);

  return names.some((name) => {
    const normalizedName = normalizeText(name);

    return (
      normalizedName.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedName)
    );
  });
}

function pushUrl(
  url: string,
  directFileUrls: string[],
  portalUrls: string[],
  allowDirect: boolean,
): void {
  if (allowDirect && isDirectFileUrl(url) && !isTedNoticeUrl(url)) {
    directFileUrls.push(url);
    return;
  }

  portalUrls.push(url);
}

function isTedNoticeUrl(url: string): boolean {
  return /ted\.europa\.eu/i.test(url);
}

function collectUrlsFromValue(value: unknown): string[] {
  if (typeof value === 'string') {
    return isUrl(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectUrlsFromValue);
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap(collectUrlsFromValue);
  }

  return [];
}

function collectNames(values: unknown[] = []): string[] {
  return values.flatMap((value) => {
    if (typeof value === 'string') {
      return [value];
    }
    if (!isRecord(value)) {
      return [];
    }

    return [
      value.documentName,
      value.name,
      value.fileName,
      value.filename,
      value.title,
    ].flatMap((item) => (typeof item === 'string' ? [item] : []));
  });
}

function getRecordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getUrl(value: unknown): string | null {
  return typeof value === 'string' && isUrl(value) ? value : null;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function uniqueUrls(urls: string[]): string[] {
  return uniqueStrings(urls.map((url) => url.trim()).filter(isUrl));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
