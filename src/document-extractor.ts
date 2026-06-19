import axios from 'axios';
import {
  TenderDocument,
  TenderDocumentsLinks,
} from '@/resources/tenders/schemas';
import {
  DocumentInputAnalysis,
  GeneralTenderAnalysisInput,
} from '@/openai/dto/openai-analysis.dto';
import {
  TenderDocumentTextExtractorService,
  TenderSourceDocumentType,
} from '@/resources/tender-normalizer/tender-document-text-extractor.service';
import {
  fetchXmlContentFromNotice,
  findXmlUrl,
} from '@/resources/tender-normalizer/tender-normalizer-xml';
import { DOCUMENT_EXTRACTOR_CONFIG } from '@/config/document-extractor.config';

export type TenderAnalysisDocumentSource =
  | 'xml'
  | 'pdf'
  | 'pdfs'
  | 'html'
  | 'htmlDirect'
  | 'tenderDocuments';

export interface TenderLinkDocumentCandidate {
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

export class DocumentExtractor {
  private readonly textExtractor = new TenderDocumentTextExtractorService();

  async buildAnalysisDocuments(
    tender: TenderDocument,
    whatNeedToTake: TenderAnalysisDocumentSource[],
  ): Promise<DocumentInputAnalysis[]> {
    const xmlDocument = whatNeedToTake.includes('xml')
      ? [await this.buildXmlDocument(tender)]
      : [];
    const tenderDocs = whatNeedToTake.includes('tenderDocuments')
      ? this.extractDocumentCandidatesFromTenderDocumentUrls(tender)
      : [];

    const restTypes = whatNeedToTake.filter(
      (key) => key !== 'xml' && key !== 'tenderDocuments',
    );
    const candidates = this.extractDocumentCandidatesFromLinks(
      tender.links,
      restTypes,
    ).concat(tenderDocs);

    const documents: GeneralTenderAnalysisInput['documents'] = [
      ...xmlDocument,
    ].filter(Boolean) as GeneralTenderAnalysisInput['documents'];

    for (const candidate of this.uniqueDocumentCandidates(candidates).slice(
      0,
      DOCUMENT_EXTRACTOR_CONFIG.analysisDocuments.maxDocuments -
        documents.length,
    )) {
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

  extractDocumentCandidatesFromLinks(
    links: TenderDocumentsLinks | undefined,
    whatNeedToTake: TenderAnalysisDocumentSource[],
  ): TenderLinkDocumentCandidate[] {
    return whatNeedToTake
      .filter((key) => key !== 'tenderDocuments')
      .map((key) => links?.[key])
      .filter(Boolean)
      .map((url) => {
        const needUrl = url && this.getNeedDocumentByLanguage(url);

        return needUrl ? this.addDocumentCandidate(needUrl) : null;
      })
      .filter(Boolean) as TenderLinkDocumentCandidate[];
  }

  getNeedDocumentByLanguage(data: Record<string, string>): string | undefined {
    return (
      Object.entries(data).find(([lang]) => /eng|en/i.test(lang))?.[1] ||
      Object.values(data)[0]
    );
  }

  async downloadTenderDocument(
    sourceUrl: string,
  ): Promise<DownloadedTenderDocument> {
    const response = await axios.get<ArrayBuffer>(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: DOCUMENT_EXTRACTOR_CONFIG.download.timeoutMs,
      headers: {
        Accept: DOCUMENT_EXTRACTOR_CONFIG.download.acceptHeader,
      },
      maxContentLength:
        DOCUMENT_EXTRACTOR_CONFIG.download.maxContentLengthBytes,
      maxBodyLength: DOCUMENT_EXTRACTOR_CONFIG.download.maxBodyLengthBytes,
    });

    return {
      content: Buffer.from(response.data),
      mimeType: this.headerToString(response.headers['content-type']),
      filename: this.filenameFromContentDisposition(
        this.headerToString(response.headers['content-disposition']),
      ),
    };
  }

  addDocumentCandidate(url: string): TenderLinkDocumentCandidate | undefined {
    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    const sourceUrl = url.trim();

    return this.contextFromLinkKey(sourceUrl);
  }

  contextFromLinkKey(
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

    return {
      sourceUrl,
      language,
      documentType,
      mimeType: 'text/html',
    };
  }

  private extractDocumentCandidatesFromTenderDocumentUrls(
    tender: TenderDocument,
  ): TenderLinkDocumentCandidate[] {
    return this.uniqueUrls([
      ...(tender.documentUrls ?? []),
      ...(tender.lots?.flatMap((lot) => lot.documentUrls ?? []) ?? []),
    ])
      .map((url) => this.addProcurementDocumentCandidate(url))
      .filter(Boolean) as TenderLinkDocumentCandidate[];
  }

  private async buildXmlDocument(
    tender: TenderDocument,
  ): Promise<DocumentInputAnalysis | undefined> {
    const xmlContent = await fetchXmlContentFromNotice(tender.links);
    const xmlSourceUrl = findXmlUrl(tender.links);

    if (!xmlContent || !xmlSourceUrl) {
      return undefined;
    }

    try {
      const extraction = await this.textExtractor.extractAndPrepareText({
        sourceUrl: xmlSourceUrl,
        mimeType: 'application/xml',
        language: undefined,
        documentType: TenderSourceDocumentType.TED_XML_NOTICE,
        content: Buffer.from(xmlContent, 'utf8'),
        buyerCountry: tender.buyerCountry,
      });

      if (extraction.aiText.length === 0) {
        return undefined;
      }

      return {
        id: xmlSourceUrl,
        filename: xmlSourceUrl ? undefined : 'ted-notice.xml',
        language: extraction.detectedLanguages?.[0] ?? null,
        documentType: TenderSourceDocumentType.TED_XML_NOTICE,
        extractedText: extraction.aiText,
      };
    } catch {
      return undefined;
    }
  }

  private addProcurementDocumentCandidate(
    url: string,
  ): TenderLinkDocumentCandidate | undefined {
    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    const sourceUrl = url.trim();
    const lowered = sourceUrl.toLowerCase();
    const language = this.languageFromUrl(lowered);

    if (lowered.includes('pdf')) {
      return {
        sourceUrl,
        language,
        documentType: TenderSourceDocumentType.PROCUREMENT_PDF,
        mimeType: 'application/pdf',
      };
    }

    if (lowered.includes('xml')) {
      return {
        sourceUrl,
        language,
        documentType: TenderSourceDocumentType.PROCUREMENT_TEXT,
        mimeType: 'application/xml',
      };
    }

    if (lowered.includes('text/plain') || lowered.endsWith('.txt')) {
      return {
        sourceUrl,
        language,
        documentType: TenderSourceDocumentType.PROCUREMENT_TEXT,
        mimeType: 'text/plain',
      };
    }

    return {
      sourceUrl,
      language,
      documentType: TenderSourceDocumentType.PROCUREMENT_HTML,
      mimeType: 'text/html',
    };
  }

  private uniqueDocumentCandidates(
    candidates: TenderLinkDocumentCandidate[],
  ): TenderLinkDocumentCandidate[] {
    const seen = new Set<string>();
    const result: TenderLinkDocumentCandidate[] = [];

    for (const candidate of candidates) {
      const key = candidate.sourceUrl.trim().toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(candidate);
    }

    return result;
  }

  private uniqueUrls(urls: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const url of urls) {
      const trimmed = url.trim();
      const key = trimmed.toLowerCase();

      if (!/^https?:\/\//i.test(trimmed) || seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(trimmed);
    }

    return result;
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

  private languageFromUrl(sourceUrl: string): string | undefined {
    const match = sourceUrl.match(
      /\b(ENG|FIN|SWE|DEU|FRA|POL|SPA|ITA|NLD|en|fi|sv|de|fr|pl|es|it|nl)\b/i,
    );

    return match?.[1]?.toUpperCase();
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
}
