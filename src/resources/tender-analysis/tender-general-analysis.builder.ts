import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { GeneralTenderAnalysisInput } from '@/openai/dto/openai-analysis.dto';
import { TenderDocument } from '../tenders/schemas';
import {
  TenderDocumentTextExtractorService,
  TenderSourceDocumentType,
} from '../tenders/tender-document-text-extractor.service';
import { isRecord } from '@/utils';

interface TenderLinkDocumentCandidate {
  sourceUrl: string;
  filename?: string;
  mimeType?: string;
  language?: string;
  documentType: TenderSourceDocumentType;
}

interface DownloadedTenderDocument {
  content: Buffer;
  mimeType?: string;
  filename?: string;
}

const MAX_ANALYSIS_DOCUMENTS = 8;

@Injectable()
export class TenderGeneralAnalysisBuilder {
  constructor(
    private readonly textExtractor: TenderDocumentTextExtractorService,
  ) {}

  async buildAnalysisInput(
    tender: TenderDocument,
  ): Promise<GeneralTenderAnalysisInput> {
    const documents = await this.buildAnalysisDocuments(tender);

    return {
      tender: {
        id: tender.id,
        publicationNumber: tender.publicationNumber ?? null,
        title: tender.title ?? null,
        buyerName: tender.buyerName ?? null,
        country: tender.buyerCountry ?? null,
        procedureType: tender.procedureType ?? null,
        noticeType: tender.noticeType ?? null,
        publicationDate: tender.publicationDate ?? null,
        deadlineDate: tender.submissionDeadline ?? null,
        cpvCodes: this.extractCpvCodes(tender),
      },
      documents,
    };
  }

  private async buildAnalysisDocuments(
    tender: TenderDocument,
  ): Promise<GeneralTenderAnalysisInput['documents']> {
    const candidates = this.extractDocumentCandidatesFromLinks(
      tender.links as any,
    );

    const documents: GeneralTenderAnalysisInput['documents'] = [];

    for (const candidate of candidates.slice(0, MAX_ANALYSIS_DOCUMENTS)) {
      try {
        const downloaded = await this.downloadTenderDocument(
          candidate.sourceUrl,
        );
        const extraction = await this.textExtractor.extractAndPrepareText({
          sourceUrl: candidate.sourceUrl,
          mimeType: downloaded.mimeType ?? candidate.mimeType,
          language: candidate.language,
          documentType: candidate.documentType,
          content: downloaded.content,
          buyerCountry: tender.buyerCountry,
        });

        if (extraction.aiText.length === 0) {
          continue;
        }

        documents.push({
          id: candidate.sourceUrl,
          filename: candidate.filename ?? downloaded.filename ?? null,
          language:
            extraction.detectedLanguages?.[0] ?? candidate.language ?? null,
          documentType: candidate.documentType,
          extractedText: extraction.aiText,
        });
      } catch {
        continue;
      }
    }

    return documents;
  }

  private getNeedDocumentByLanguage(
    data: Record<string, string>,
  ): string | undefined {
    return (
      Object.entries(data).find(([lang]) => /eng|en/i.test(lang))?.[1] ||
      Object.values(data)[0]
    );
  }

  private extractDocumentCandidatesFromLinks(
    links: Record<
      'xml' | 'pdf' | 'pdfs' | 'html' | 'htmlDirect',
      Record<string, string>
    >,
  ): TenderLinkDocumentCandidate[] {
    const isPdfExists = !!Object.values(links.pdf)[0]?.trim();
    return (
      [links.xml]
        // return [links.xml, isPdfExists ? links.pdf : links.html, links.pdfs]
        .filter(Boolean)
        .map((url) => {
          const needUrl = this.getNeedDocumentByLanguage(url);

          return needUrl ? this.addDocumentCandidate(needUrl) : null;
        })
        .filter(Boolean) as TenderLinkDocumentCandidate[]
    );
  }

  private selectPreferredLanguageCandidates(
    candidates: TenderLinkDocumentCandidate[],
  ): TenderLinkDocumentCandidate[] {
    const candidateGroups = new Map<string, TenderLinkDocumentCandidate[]>();

    for (const candidate of candidates) {
      const groupKey = this.getLanguageVariantGroupKey(candidate);
      const group = candidateGroups.get(groupKey);

      if (group) {
        group.push(candidate);
      } else {
        candidateGroups.set(groupKey, [candidate]);
      }
    }

    return Array.from(candidateGroups.values()).map(
      (group) =>
        group.find((candidate) => this.isEnglishLanguage(candidate.language)) ??
        group[0],
    );
  }

  private getLanguageVariantGroupKey(
    candidate: TenderLinkDocumentCandidate,
  ): string {
    const url = this.stripLanguageFromUrl(candidate.sourceUrl);
    const filename = candidate.filename
      ? this.stripLanguageFromText(candidate.filename)
      : '';

    return `${candidate.documentType}:${url}:${filename}`;
  }

  private stripLanguageFromUrl(sourceUrl: string): string {
    try {
      const url = new URL(sourceUrl);
      url.pathname = this.stripLanguageFromText(url.pathname);
      url.search = this.stripLanguageFromText(url.search);

      return url.toString();
    } catch {
      return this.stripLanguageFromText(sourceUrl);
    }
  }

  private stripLanguageFromText(value: string): string {
    return value
      .replace(
        /\b(ENG|EN|FIN|FI|SWE|SV|DEU|DE|FRA|FR|POL|PL|SPA|ES|ITA|IT|NLD|NL)\b/gi,
        '{LANG}',
      )
      .replace(
        /([_-])(eng|en|fin|fi|swe|sv|deu|de|fra|fr|pol|pl|spa|es|ita|it|nld|nl)(?=[_.-])/gi,
        '$1{LANG}',
      )
      .toLowerCase();
  }

  private isEnglishLanguage(language?: string): boolean {
    const normalized = language?.trim().toUpperCase();

    return normalized === 'ENG' || normalized === 'EN';
  }

  private compareDocumentCandidates(
    left: TenderLinkDocumentCandidate,
    right: TenderLinkDocumentCandidate,
  ): number {
    const documentPriority =
      this.getDocumentPriority(left.documentType) -
      this.getDocumentPriority(right.documentType);

    if (documentPriority !== 0) {
      return documentPriority;
    }

    const languagePriority =
      this.getLanguagePriority(left.language) -
      this.getLanguagePriority(right.language);

    if (languagePriority !== 0) {
      return languagePriority;
    }

    return left.sourceUrl.localeCompare(right.sourceUrl);
  }

  private getLanguagePriority(language?: string): number {
    if (this.isEnglishLanguage(language)) {
      return 0;
    }

    return language ? 1 : 2;
  }

  private addDocumentCandidate(
    url: string,
  ): TenderLinkDocumentCandidate | undefined {
    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    const sourceUrl = url.trim();

    return this.contextFromLinkKey(sourceUrl);
  }

  private contextFromLinkKey(
    sourceUrl: string,
  ): TenderLinkDocumentCandidate | undefined {
    const lowered = sourceUrl.toLowerCase();

    const language = this.languageFromUrl(lowered);
    const documentType = this.detectSourceDocumentType(lowered);

    if (lowered.includes('xml')) {
      return {
        sourceUrl,
        language,
        documentType,
        mimeType: 'application/xml',
      };
    }

    if (lowered.includes('pdf')) {
      return {
        sourceUrl,
        language,
        documentType,
        mimeType: 'application/pdf',
      };
    }

    if (lowered.includes('html')) {
      return {
        sourceUrl,
        language,
        documentType,
        mimeType: 'text/html',
      };
    }

    return undefined;
  }

  private async downloadTenderDocument(
    sourceUrl: string,
  ): Promise<DownloadedTenderDocument> {
    const response = await axios.get<ArrayBuffer>(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      headers: {
        Accept:
          'application/pdf, application/xml, text/xml, text/html, text/plain, */*',
      },
      maxContentLength: 25 * 1024 * 1024,
      maxBodyLength: 25 * 1024 * 1024,
    });

    return {
      content: Buffer.from(response.data),
      mimeType: this.headerToString(response.headers['content-type']),
      filename: this.filenameFromContentDisposition(
        this.headerToString(response.headers['content-disposition']),
      ),
    };
  }

  private detectSourceDocumentType(
    sourceUrl: string,
  ): TenderSourceDocumentType {
    if (sourceUrl.includes('xml')) {
      return TenderSourceDocumentType.TED_XML_NOTICE;
    }

    if (sourceUrl.includes('pdf')) {
      return TenderSourceDocumentType.TED_PDF_NOTICE;
    }

    if (sourceUrl.includes('html') || sourceUrl.includes('text/html')) {
      return TenderSourceDocumentType.TED_HTML_NOTICE;
    }

    if (sourceUrl.includes('text/plain')) {
      return TenderSourceDocumentType.PROCUREMENT_TEXT;
    }

    return TenderSourceDocumentType.OTHER;
  }

  private getDocumentPriority(documentType: TenderSourceDocumentType): number {
    if (documentType === TenderSourceDocumentType.TED_XML_NOTICE) {
      return 0;
    }

    if (documentType === TenderSourceDocumentType.TED_PDF_NOTICE) {
      return 1;
    }

    if (documentType === TenderSourceDocumentType.TED_HTML_NOTICE) {
      return 2;
    }

    return 3;
  }

  private pickRecordString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = record[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return undefined;
  }

  private filenameFromUrl(sourceUrl: string): string | undefined {
    try {
      const pathname = new URL(sourceUrl).pathname;
      const filename = pathname.split('/').filter(Boolean).pop();

      return filename && filename.includes('.') ? filename : undefined;
    } catch {
      return undefined;
    }
  }

  private languageFromUrl(sourceUrl: string): string | undefined {
    const match = sourceUrl.match(
      /\b(ENG|FIN|SWE|DEU|FRA|POL|SPA|ITA|NLD|en|fi|sv|de|fr|pl|es|it|nl)\b/i,
    );

    return match?.[1]?.toUpperCase();
  }

  private filenameFromContentDisposition(
    contentDisposition?: string,
  ): string | undefined {
    if (contentDisposition === undefined) {
      return undefined;
    }

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
      return decodeURIComponent(utf8Match[1].trim());
    }

    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);

    return filenameMatch?.[1]?.trim();
  }

  private headerToString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.find((item): item is string => typeof item === 'string');
    }

    return undefined;
  }

  private extractCpvCodes(tender: TenderDocument): string[] {
    const codes = [
      ...(tender.cpvCodes ?? []),
      ...(tender.classificationCpv ?? []),
    ]
      .map((cpv) => this.extractCpvCode(cpv))
      .filter((code): code is string => code !== null);

    return Array.from(new Set(codes));
  }

  private extractCpvCode(cpv: unknown): string | null {
    if (typeof cpv === 'string') {
      return cpv;
    }

    if (!isRecord(cpv)) {
      return null;
    }

    return typeof cpv.code === 'string' ? cpv.code : null;
  }
}
