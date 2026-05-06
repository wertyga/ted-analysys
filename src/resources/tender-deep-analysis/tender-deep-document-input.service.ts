import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenderDocument } from '../tenders/schemas';
import { BaseAnalysisBuilder } from '@/analysis-builder/base-analysis.builder';
import { DocumentInputAnalysis } from '@/openai/dto/openai-analysis.dto';

export interface DeepDocumentInput {
  documentAnalyses: unknown[];
  documentTextSnippets: unknown[];
}

@Injectable()
export class TenderDeepDocumentInputService extends BaseAnalysisBuilder {
  async buildDeepDocumentInput(
    tender: TenderDocument,
  ): Promise<DeepDocumentInput> {
    const documents = await this.buildAnalysisDocuments(tender, [
      'xml',
      'pdf',
      'pdfs',
    ]);

    return {
      documentAnalyses: documents.map((document) =>
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
