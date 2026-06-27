import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { isTag, type AnyNode, type Element } from 'domhandler';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { DOCUMENT_EXTRACTOR_CONFIG } from '@/config/document-extractor.config';

export enum TenderSourceDocumentType {
  TED_XML_NOTICE = 'TED_XML_NOTICE',
  TED_PDF_NOTICE = 'TED_PDF_NOTICE',
  TED_HTML_NOTICE = 'TED_HTML_NOTICE',
  PROCUREMENT_PDF = 'PROCUREMENT_PDF',
  PROCUREMENT_HTML = 'PROCUREMENT_HTML',
  PROCUREMENT_TEXT = 'PROCUREMENT_TEXT',
  OTHER = 'OTHER',
}

export interface TenderDocumentExtractionInput {
  sourceUrl: string;
  filename?: string;
  mimeType?: string;
  language?: string; // ENG, FIN, MUL, UNKNOWN
  detectedLanguages?: string[];
  isMultilingual?: boolean;
  documentType: TenderSourceDocumentType;
  content: Buffer | string;
  buyerCountry?: string;
}

export interface TenderDocumentExtractionResult {
  rawText: string;
  aiText: string;
  textHash: string;
  contentLength: number;
  detectedLanguages?: string[];
  isMultilingual: boolean;
  warnings: string[];
}

interface PrepareTextForAiOptions {
  maxCharsPerDocument?: number;
}

type SupportedDocumentKind = 'pdf' | 'docx' | 'xml' | 'html' | 'text';

interface XmlReadableTenderTextOptions {
  preferredLanguages: string[];
  maxChars?: number;
}

interface XmlReadableTenderTextResult {
  text: string;
  detectedLanguages: string[];
  warnings: string[];
}

@Injectable()
export class TenderDocumentTextExtractorService {
  async extractAndPrepareText(
    input: TenderDocumentExtractionInput,
  ): Promise<TenderDocumentExtractionResult> {
    this.validateContent(input);

    const warnings: string[] = [];
    const documentKind = this.detectDocumentKind(input);
    let rawText = '';
    let detectedLanguages = this.normalizeLanguageCodes(
      input.detectedLanguages ?? [],
    );
    let isMultilingual = input.isMultilingual ?? false;

    if (documentKind === 'pdf') {
      rawText = await this.extractPdfText(input.content);
      if (!rawText.trim()) {
        warnings.push('No text extracted from PDF. OCR may be required.');
      }
      detectedLanguages = this.mergeLanguages(detectedLanguages, [
        input.language,
      ]);
      isMultilingual = this.resolveIsMultilingual(input, detectedLanguages);
    } else if (documentKind === 'docx') {
      const docxResult = await this.extractDocxText(input.content);

      rawText = docxResult.text;
      warnings.push(...docxResult.warnings);
      if (!rawText.trim()) {
        warnings.push('No text extracted from DOCX.');
      }
      detectedLanguages = this.mergeLanguages(detectedLanguages, [
        input.language,
      ]);
      isMultilingual = this.resolveIsMultilingual(input, detectedLanguages);
    } else if (documentKind === 'xml') {
      const xml = this.contentToString(input.content);
      const xmlResult = this.xmlToReadableTenderText(xml, {
        preferredLanguages: this.buildPreferredLanguages(input),
      });
      rawText = xmlResult.text;
      detectedLanguages = this.mergeLanguages(
        detectedLanguages,
        xmlResult.detectedLanguages,
      );
      warnings.push(...xmlResult.warnings);
      isMultilingual = this.resolveIsMultilingual(input, detectedLanguages);
    } else if (documentKind === 'html') {
      const html = this.contentToString(input.content);

      rawText = this.htmlToReadableText(html);

      detectedLanguages = this.mergeLanguages(
        detectedLanguages,
        this.detectLanguagesFromHtml(html),
        [this.getKnownInputLanguage(input.language)],
      );
      isMultilingual =
        input.isMultilingual === true || detectedLanguages.length > 1;
    } else {
      rawText = this.contentToString(input.content);
      detectedLanguages = this.mergeLanguages(detectedLanguages, [
        input.language,
      ]);
      isMultilingual = input.isMultilingual ?? detectedLanguages.length > 1;
    }

    rawText = this.normalizeRawText(rawText);
    const aiText = this.prepareTextForAi(rawText);

    return {
      rawText,
      aiText,
      textHash: this.sha256(rawText),
      contentLength: rawText.length,
      detectedLanguages,
      isMultilingual,
      warnings,
    };
  }

  private detectDocumentKind(
    input: TenderDocumentExtractionInput,
  ): SupportedDocumentKind {
    const mimeType = input.mimeType?.toLowerCase().split(';')[0].trim();
    const filename = input.filename?.toLowerCase() ?? '';
    const sourceUrl = input.sourceUrl.toLowerCase().split('?')[0];
    const documentType = input.documentType;

    if (
      mimeType === 'application/pdf' ||
      filename.endsWith('.pdf') ||
      sourceUrl.endsWith('.pdf') ||
      documentType === TenderSourceDocumentType.TED_PDF_NOTICE ||
      documentType === TenderSourceDocumentType.PROCUREMENT_PDF
    ) {
      return 'pdf';
    }

    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.endsWith('.docx') ||
      sourceUrl.endsWith('.docx')
    ) {
      return 'docx';
    }

    if (
      mimeType === 'application/xml' ||
      mimeType === 'text/xml' ||
      filename.endsWith('.xml') ||
      sourceUrl.endsWith('.xml') ||
      sourceUrl.endsWith('/xml') ||
      documentType === TenderSourceDocumentType.TED_XML_NOTICE
    ) {
      return 'xml';
    }

    if (
      mimeType === 'text/html' ||
      filename.endsWith('.html') ||
      filename.endsWith('.htm') ||
      sourceUrl.endsWith('.html') ||
      sourceUrl.endsWith('.htm') ||
      documentType === TenderSourceDocumentType.TED_HTML_NOTICE ||
      documentType === TenderSourceDocumentType.PROCUREMENT_HTML
    ) {
      return 'html';
    }

    if (
      typeof input.content === 'string' ||
      mimeType === 'text/plain' ||
      documentType === TenderSourceDocumentType.PROCUREMENT_TEXT
    ) {
      return 'text';
    }

    throw new Error('Unsupported tender document format.');
  }

  private async extractPdfText(content: Buffer | string): Promise<string> {
    if (!Buffer.isBuffer(content)) {
      throw new Error('PDF extraction requires Buffer content.');
    }

    const parser = new PDFParse({ data: content });

    try {
      const pdfData = await parser.getText();
      return pdfData.text ?? '';
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocxText(
    content: Buffer | string,
  ): Promise<{ text: string; warnings: string[] }> {
    if (!Buffer.isBuffer(content)) {
      throw new Error('DOCX extraction requires Buffer content.');
    }

    const result = await mammoth.extractRawText({ buffer: content });

    return {
      text: result.value ?? '',
      warnings: result.messages.map((message) => message.message),
    };
  }

  private htmlToReadableText(html: string): string {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, nav, footer, header').remove();
    const bodyText = $('body').text() || $.root().text();

    return this.normalizeRawText(this.decodeXmlEntities(bodyText));
  }

  private normalizeRawText(text: string): string {
    return text
      .replace(/\u0000/g, '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  private prepareTextForAi(
    text: string,
    options: PrepareTextForAiOptions = {},
  ): string {
    const maxChars =
      options.maxCharsPerDocument ??
      DOCUMENT_EXTRACTOR_CONFIG.aiText.defaultMaxCharsPerDocument;
    const cleaned = this.removeRepeatedPdfArtifacts(
      this.normalizeRawText(text),
    );

    if (cleaned.length <= maxChars) {
      return cleaned;
    }

    const beginning = cleaned.slice(
      0,
      Math.min(
        DOCUMENT_EXTRACTOR_CONFIG.aiText.beginningCharsWhenTruncated,
        maxChars,
      ),
    );
    const remainingBudget =
      maxChars -
      beginning.length -
      DOCUMENT_EXTRACTOR_CONFIG.aiText.truncationMarker.length -
      4;

    if (remainingBudget <= 0) {
      return this.normalizeRawText(
        `${beginning.slice(0, maxChars - DOCUMENT_EXTRACTOR_CONFIG.aiText.truncationMarker.length - 2)}\n\n${DOCUMENT_EXTRACTOR_CONFIG.aiText.truncationMarker}`,
      ).slice(0, maxChars);
    }

    const snippets = this.buildKeywordSnippets(
      cleaned,
      DOCUMENT_EXTRACTOR_CONFIG.retentionKeywords,
      remainingBudget,
      beginning.length,
    );

    return this.normalizeRawText(
      `${beginning}\n\n${DOCUMENT_EXTRACTOR_CONFIG.aiText.truncationMarker}\n\n${snippets}`,
    ).slice(0, maxChars);
  }

  private removeRepeatedPdfArtifacts(text: string): string {
    const lines = text.split('\n');
    const withoutPageMarkers = lines.filter((line) => {
      const trimmed = line.trim();
      return (
        !/^page\s+\d+\s+(of|\/)\s+\d+$/i.test(trimmed) &&
        !/^\d+\s*\/\s*\d+$/.test(trimmed)
      );
    });
    const counts = new Map<string, number>();

    for (const line of withoutPageMarkers) {
      const trimmed = line.trim();
      if (
        trimmed.length > 0 &&
        trimmed.length <=
          DOCUMENT_EXTRACTOR_CONFIG.pdfArtifacts.maxRepeatedLineChars
      ) {
        counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
      }
    }

    const totalLines = withoutPageMarkers.length;
    const filtered = withoutPageMarkers.filter((line) => {
      const trimmed = line.trim();
      const count = counts.get(trimmed) ?? 0;
      return !(
        trimmed.length > 0 &&
        trimmed.length <=
          DOCUMENT_EXTRACTOR_CONFIG.pdfArtifacts.maxRepeatedLineChars &&
        count >=
          DOCUMENT_EXTRACTOR_CONFIG.pdfArtifacts.minRepeatedLineOccurrences &&
        count / Math.max(totalLines, 1) >
          DOCUMENT_EXTRACTOR_CONFIG.pdfArtifacts.minRepeatedLineRatio
      );
    });

    return this.normalizeRawText(filtered.join('\n'));
  }

  private buildKeywordSnippets(
    text: string,
    keywords: string[],
    budget: number,
    startAfterIndex: number,
  ): string {
    const lowerText = text.toLowerCase();
    const ranges: Array<{ start: number; end: number }> = [];
    const contextChars =
      DOCUMENT_EXTRACTOR_CONFIG.aiText.keywordSnippetContextChars;

    for (const keyword of keywords) {
      let searchIndex = startAfterIndex;
      const lowerKeyword = keyword.toLowerCase();

      while (searchIndex < lowerText.length) {
        const index = lowerText.indexOf(lowerKeyword, searchIndex);
        if (index === -1) {
          break;
        }
        ranges.push({
          start: Math.max(startAfterIndex, index - contextChars),
          end: Math.min(
            text.length,
            index + lowerKeyword.length + contextChars,
          ),
        });
        searchIndex = index + lowerKeyword.length;
      }
    }

    const mergedRanges = this.mergeRanges(ranges).sort(
      (a, b) => a.start - b.start,
    );
    const snippets: string[] = [];
    let used = 0;

    for (const range of mergedRanges) {
      if (used >= budget) {
        break;
      }

      const separator = snippets.length > 0 ? '\n\n---\n\n' : '';
      const available = budget - used - separator.length;
      if (available <= 0) {
        break;
      }

      const snippet = text.slice(range.start, range.end).slice(0, available);
      snippets.push(`${separator}${snippet}`);
      used += separator.length + snippet.length;
    }

    return this.normalizeRawText(snippets.join(''));
  }

  private mergeRanges(
    ranges: Array<{ start: number; end: number }>,
  ): Array<{ start: number; end: number }> {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];

    for (const range of sorted) {
      const previous = merged[merged.length - 1];
      if (
        previous &&
        range.start <=
          previous.end +
            DOCUMENT_EXTRACTOR_CONFIG.aiText.keywordSnippetMergeGapChars
      ) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }

    return merged;
  }

  private normalizeLanguageCode(code?: string): string | undefined {
    const normalized = code
      ?.trim()
      .replace(/^['"]|['"]$/g, '')
      .toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const alias = DOCUMENT_EXTRACTOR_CONFIG.languages.aliases[normalized];
    if (alias) {
      return alias;
    }

    const upperCode = normalized.toUpperCase();
    return DOCUMENT_EXTRACTOR_CONFIG.languages.tedCodes.has(upperCode)
      ? upperCode
      : undefined;
  }

  private getKnownInputLanguage(code?: string): string | undefined {
    const language = this.normalizeLanguageCode(code);
    return language && !['MUL', 'UNKNOWN'].includes(language)
      ? language
      : undefined;
  }

  private getBuyerPreferredLanguages(buyerCountry?: string): string[] {
    const country = buyerCountry?.trim().toUpperCase();
    return country
      ? (DOCUMENT_EXTRACTOR_CONFIG.languages.buyerCountryPreferredLanguages[
          country
        ] ?? ['ENG'])
      : ['ENG'];
  }

  private buildPreferredLanguages(
    input: TenderDocumentExtractionInput,
  ): string[] {
    const languages = [
      'ENG',
      ...this.getBuyerPreferredLanguages(input.buyerCountry),
    ];
    const inputLanguage = this.normalizeLanguageCode(input.language);

    if (inputLanguage && !['MUL', 'UNKNOWN'].includes(inputLanguage)) {
      languages.push(inputLanguage);
    }

    languages.push(
      ...this.normalizeLanguageCodes(input.detectedLanguages ?? []),
    );

    return this.uniqueLanguages(
      languages.filter((code) => code !== 'UNKNOWN' && code !== 'MUL'),
    );
  }

  private detectLanguagesFromXml(xml: string): string[] {
    const languages: string[] = [];
    const attributePattern =
      /\b(?:xml:lang|lang|languageID|language|locale)\s*=\s*["']([^"']+)["']/gi;
    let attributeMatch: RegExpExecArray | null;

    while ((attributeMatch = attributePattern.exec(xml)) !== null) {
      languages.push(...this.extractLanguageValues(attributeMatch[1]));
    }

    const tagPattern =
      /<(?:[^>\s:]+:)?(?:language|languageCode|noticeLanguage|officialLanguage)[^>]*>\s*([^<\s]+)\s*</gi;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagPattern.exec(xml)) !== null) {
      languages.push(...this.extractLanguageValues(tagMatch[1]));
    }

    const tedCodePattern =
      /\b(ENG|FIN|DEU|FRA|SWE|POL|SPA|ITA|NLD|DAN|EST|LAV|LIT|CES|SLK|SLV|HUN|POR|RON|BUL|ELL|HRV|MLT|GLE)\b/g;
    let codeMatch: RegExpExecArray | null;

    while ((codeMatch = tedCodePattern.exec(xml)) !== null) {
      languages.push(codeMatch[1]);
    }

    return this.uniqueLanguages(languages);
  }

  private detectLanguagesFromHtml(html: string): string[] {
    const languages: string[] = [];
    const htmlLangMatch = html.match(
      /<html[^>]+\blang\s*=\s*["']([^"']+)["']/i,
    );
    if (htmlLangMatch) {
      languages.push(...this.extractLanguageValues(htmlLangMatch[1]));
    }

    const metaLanguageMatch = html.match(
      /<meta[^>]+(?:name|http-equiv)\s*=\s*["'](?:language|content-language)["'][^>]+content\s*=\s*["']([^"']+)["']/i,
    );
    if (metaLanguageMatch) {
      languages.push(...this.extractLanguageValues(metaLanguageMatch[1]));
    }

    return this.uniqueLanguages(languages);
  }

  private xmlToReadableTenderText(
    xml: string,
    options: XmlReadableTenderTextOptions,
  ): XmlReadableTenderTextResult {
    const detectedLanguages = this.detectLanguagesFromXml(xml);
    const preferredLanguages = this.uniqueLanguages(options.preferredLanguages);
    const warnings: string[] = [];

    try {
      if (this.hasLikelyMalformedXml(xml)) {
        throw new Error('Malformed XML detected before structural extraction.');
      }

      const $ = cheerio.load(xml, { xmlMode: true });
      const lines: string[] = [];

      $.root()
        .children()
        .each((_, element) => {
          this.collectReadableXmlLines($, element, preferredLanguages, lines);
        });

      const body = this.normalizeRawText(lines.join('\n'));
      if (!body) {
        throw new Error('XML structural extraction produced no text.');
      }

      return {
        text: this.normalizeRawText(
          [
            '[TED XML NOTICE]',
            `Detected languages: ${detectedLanguages.join(', ') || 'UNKNOWN'}`,
            `Preferred languages used: ${preferredLanguages.join(', ') || 'ENG'}`,
            '',
            body,
          ].join('\n'),
        ),
        detectedLanguages,
        warnings,
      };
    } catch {
      warnings.push('XML multilingual filtering used fallback mode');

      return {
        text: this.normalizeRawText(
          [
            '[TED XML NOTICE]',
            `Detected languages: ${detectedLanguages.join(', ') || 'UNKNOWN'}`,
            `Preferred languages used: ${preferredLanguages.join(', ') || 'ENG'}`,
            '',
            this.xmlFallbackToText(xml),
          ].join('\n'),
        ),
        detectedLanguages,
        warnings,
      };
    }
  }

  private collectReadableXmlLines(
    $: cheerio.CheerioAPI,
    element: AnyNode,
    preferredLanguages: string[],
    lines: string[],
  ): void {
    if (element.type === 'text') {
      const text = this.normalizeInlineText($(element).text());
      if (text) {
        lines.push(text);
      }
      return;
    }

    if (!isTag(element)) {
      return;
    }

    const nodeLanguage = this.getElementLanguage($, element);
    if (
      nodeLanguage &&
      DOCUMENT_EXTRACTOR_CONFIG.languages.tedCodes.has(nodeLanguage) &&
      preferredLanguages.length > 0 &&
      !preferredLanguages.includes(nodeLanguage)
    ) {
      return;
    }

    const children = $(element).contents().toArray();
    const elementChildren = children.filter((child) => child.type === 'tag');
    const directText = this.normalizeInlineText(
      children
        .filter((child) => child.type === 'text')
        .map((child) => $(child).text())
        .join(' '),
    );

    if (directText) {
      lines.push(`${this.formatXmlElementName(element.name)}: ${directText}`);
    }

    if (elementChildren.length === 0 && !directText) {
      const text = this.normalizeInlineText($(element).text());
      if (text) {
        lines.push(`${this.formatXmlElementName(element.name)}: ${text}`);
      }
      return;
    }

    for (const child of elementChildren) {
      this.collectReadableXmlLines($, child, preferredLanguages, lines);
    }
  }

  private getElementLanguage(
    $: cheerio.CheerioAPI,
    element: Element,
  ): string | undefined {
    const node = $(element);
    const languageAttributes =
      DOCUMENT_EXTRACTOR_CONFIG.languages.xmlLanguageAttributes;

    for (const attribute of languageAttributes) {
      const normalized = this.normalizeLanguageCode(node.attr(attribute));
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private hasLikelyMalformedXml(xml: string): boolean {
    const openAngleCount = (xml.match(/</g) ?? []).length;
    const closeAngleCount = (xml.match(/>/g) ?? []).length;

    return openAngleCount !== closeAngleCount;
  }

  private xmlFallbackToText(xml: string): string {
    return this.normalizeRawText(
      this.decodeXmlEntities(
        xml
          .replace(/<\?xml[^>]*>/gi, '\n')
          .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
          .replace(/<!--[\s\S]*?-->/g, '\n')
          .replace(/<[^>]+>/g, '\n'),
      ),
    );
  }

  private formatXmlElementName(name: string): string {
    return name.split(':').pop()?.replace(/[-_]+/g, ' ') ?? name;
  }

  private normalizeInlineText(text: string): string {
    return this.decodeXmlEntities(text).replace(/\s+/g, ' ').trim();
  }

  private decodeXmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, codePoint: string) =>
        String.fromCodePoint(Number(codePoint)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_, codePoint: string) =>
        String.fromCodePoint(parseInt(codePoint, 16)),
      );
  }

  private sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private validateContent(input: TenderDocumentExtractionInput): void {
    if (typeof input.content !== 'string' && !Buffer.isBuffer(input.content)) {
      throw new Error('Invalid tender document content.');
    }
  }

  private contentToString(content: Buffer | string): string {
    return Buffer.isBuffer(content) ? content.toString('utf8') : content;
  }

  private resolveIsMultilingual(
    input: TenderDocumentExtractionInput,
    detectedLanguages: string[],
  ): boolean {
    const inputLanguage = this.normalizeLanguageCode(input.language);

    return (
      input.isMultilingual === true ||
      inputLanguage === 'MUL' ||
      input.documentType === TenderSourceDocumentType.TED_XML_NOTICE ||
      detectedLanguages.filter((code) => !['MUL', 'UNKNOWN'].includes(code))
        .length > 1
    );
  }

  private mergeLanguages(
    ...languageGroups: Array<Array<string | undefined>>
  ): string[] {
    return this.uniqueLanguages(languageGroups.flat());
  }

  private normalizeLanguageCodes(codes: Array<string | undefined>): string[] {
    return this.uniqueLanguages(
      codes
        .map((code) => this.normalizeLanguageCode(code))
        .filter((code): code is string => Boolean(code)),
    );
  }

  private extractLanguageValues(value: string): string[] {
    return value
      .split(/[,;\s_-]+/)
      .map((code) => this.normalizeLanguageCode(code))
      .filter((code): code is string => Boolean(code));
  }

  private uniqueLanguages(codes: Array<string | undefined>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const code of codes) {
      if (!code || seen.has(code)) {
        continue;
      }
      seen.add(code);
      result.push(code);
    }

    return result;
  }
}

/*
Integration example:

const extraction = await this.textExtractor.extractAndPrepareText({
  sourceUrl: doc.sourceUrl,
  filename: doc.filename,
  mimeType: doc.mimeType,
  language: doc.language,
  detectedLanguages: doc.detectedLanguages,
  isMultilingual: doc.isMultilingual,
  documentType: doc.documentType,
  content: downloadedBuffer,
  buyerCountry: tender.buyer.address.country,
});

await this.sourceDocumentModel.updateOne(
  { _id: doc._id },
  {
    $set: {
      extractionStatus: DocumentExtractionStatus.DONE,
      textHash: extraction.textHash,
      contentLength: extraction.contentLength,
      detectedLanguages: extraction.detectedLanguages,
      isMultilingual: extraction.isMultilingual,
      fetchedAt: new Date(),
      extractedAt: new Date(),
    },
    $unset: { errorMessage: '' },
  },
);

documentsForAi.push({
  sourceUrl: doc.sourceUrl,
  filename: doc.filename,
  language: doc.language,
  detectedLanguages: extraction.detectedLanguages,
  isMultilingual: extraction.isMultilingual,
  documentType: doc.documentType,
  extractedText: extraction.aiText,
});
*/
