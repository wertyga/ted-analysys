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
} from '@/resources/tenders/tender-document-text-extractor.service';
import {
  fetchXmlContentFromNotice,
  findXmlUrl,
} from '@/resources/tenders/tender-normalizer-xml';

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

export class BaseAnalysisBuilder {
  textExtractor = new TenderDocumentTextExtractorService();

  async buildAnalysisDocuments(
    tender: TenderDocument,
    whatNeedToTake: ('xml' | 'pdf' | 'pdfs' | 'html' | 'htmlDirect')[],
  ): Promise<DocumentInputAnalysis[]> {
    const xmlDocument = whatNeedToTake.includes('xml')
      ? await this.buildXmlDocument(tender)
      : undefined;
    const candidates = this.extractDocumentCandidatesFromLinks(
      tender.links,
      whatNeedToTake,
    ).filter((candidate) => {
      return candidate.documentType !== TenderSourceDocumentType.TED_XML_NOTICE;
    });

    const documents: GeneralTenderAnalysisInput['documents'] = xmlDocument
      ? [xmlDocument]
      : [];

    for (const candidate of candidates.slice(
      0,
      MAX_ANALYSIS_DOCUMENTS - documents.length,
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

  extractDocumentCandidatesFromLinks(
    links: TenderDocumentsLinks | undefined,
    whatNeedToTake: ('xml' | 'pdf' | 'pdfs' | 'html' | 'htmlDirect')[],
  ): TenderLinkDocumentCandidate[] {
    return whatNeedToTake
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
