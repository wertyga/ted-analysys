import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenderDocument } from '../tenders/schemas';
import { DocumentInputAnalysis } from '@/openai/dto/openai-analysis.dto';
import { DocumentExtractor } from '@/document-extractor';

export interface DeepDocumentInput {
  documentMetadata: unknown[];
  documentTextSnippets: unknown[];
}

@Injectable()
export class TenderDeepDocumentInputService {
  private readonly documentExtractor = new DocumentExtractor();

  async buildDeepDocumentInput(
    tender: TenderDocument,
  ): Promise<DeepDocumentInput> {
    const documents = await this.documentExtractor.buildAnalysisDocuments(
      tender,
      ['xml', 'pdf', 'pdfs', 'tenderDocuments'],
    );

    return {
      documentMetadata: documents.map((document) =>
        this.toDocumentAnalysis(document),
      ),
      documentTextSnippets: documents.map((document) =>
        this.toDocumentTextSnippet(document),
      ),
    };
  }

  private toDocumentAnalysis(document: DocumentInputAnalysis): unknown {
    const textHash = this.hashText(document.extractedText);

    return {
      sourceUrl: document.id,
      filename: document.filename ?? null,
      documentType: document.documentType ?? null,
      language: document.language ?? null,
      textHash,
      contentLength: document.extractedText.length,
      analysisStatus: 'text_extracted_for_deep_analysis',
    };
  }

  private toDocumentTextSnippet(document: DocumentInputAnalysis): unknown {
    return {
      sourceUrl: document.id,
      filename: document.filename ?? null,
      documentType: document.documentType ?? null,
      language: document.language ?? null,
      textHash: this.hashText(document.extractedText),
      extractedText: document.extractedText,
    };
  }

  private hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}
