import {
  TenderDocumentTextExtractorService,
  TenderSourceDocumentType,
} from './tender-document-text-extractor.service';

const mockGetText = jest.fn();
const mockDestroy = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

interface ExtractorPrivateMethods {
  normalizeRawText(text: string): string;
  prepareTextForAi(
    text: string,
    options?: { maxCharsPerDocument?: number },
  ): string;
  normalizeLanguageCode(code?: string): string | undefined;
}

describe('TenderDocumentTextExtractorService', () => {
  let service: TenderDocumentTextExtractorService;
  let privateService: ExtractorPrivateMethods;

  beforeEach(() => {
    service = new TenderDocumentTextExtractorService();
    privateService = service as unknown as ExtractorPrivateMethods;
    mockGetText.mockReset();
    mockDestroy.mockReset();
    mockDestroy.mockResolvedValue(undefined);
  });

  it('extracts text from mocked pdf-parse result', async () => {
    mockGetText.mockResolvedValue({ text: 'Tender PDF text' });

    const result = await service.extractAndPrepareText({
      sourceUrl: 'https://example.test/notice.pdf',
      filename: 'notice.pdf',
      mimeType: 'application/pdf',
      language: 'ENG',
      documentType: TenderSourceDocumentType.TED_PDF_NOTICE,
      content: Buffer.from('%PDF mocked'),
    });

    expect(result.rawText).toBe('Tender PDF text');
    expect(result.aiText).toBe('Tender PDF text');
    expect(result.detectedLanguages).toEqual(['ENG']);
    expect(result.warnings).toEqual([]);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('returns warning for empty PDF text without throwing', async () => {
    mockGetText.mockResolvedValue({ text: '' });

    const result = await service.extractAndPrepareText({
      sourceUrl: 'https://example.test/notice.pdf',
      filename: 'notice.pdf',
      mimeType: 'application/pdf',
      language: 'ENG',
      documentType: TenderSourceDocumentType.TED_PDF_NOTICE,
      content: Buffer.from('%PDF mocked'),
    });

    expect(result.rawText).toBe('');
    expect(result.warnings).toContain(
      'No text extracted from PDF. OCR may be required.',
    );
  });

  it('normalizes raw text without removing headings', () => {
    const result = privateService.normalizeRawText(
      'Heading\u0000\r\nLine with spaces   \r\n\r\n\r\n\r\nNext section',
    );

    expect(result).toBe('Heading\nLine with spaces\n\n\nNext section');
  });

  it('limits AI text to maxChars', () => {
    const result = privateService.prepareTextForAi('A'.repeat(500), {
      maxCharsPerDocument: 120,
    });

    expect(result.length).toBeLessThanOrEqual(120);
    expect(result).toContain('[...document truncated for AI input...]');
  });

  it('keeps keyword snippets in long documents', () => {
    const longText = [
      'Introduction '.repeat(300),
      'Eligibility requirements are important.',
      'Filler '.repeat(300),
      'Award criteria and liability are listed here.',
      'Filler '.repeat(300),
      'Sopimus ja vaatimukset kuvataan tässä.',
    ].join('\n');

    const result = privateService.prepareTextForAi(longText, {
      maxCharsPerDocument: 12_000,
    });

    expect(result).toContain('Eligibility requirements');
    expect(result).toContain('Award criteria');
    expect(result).toContain('liability');
    expect(result).toContain('Sopimus ja vaatimukset');
  });

  it('normalizes language codes', () => {
    expect(privateService.normalizeLanguageCode('en')).toBe('ENG');
    expect(privateService.normalizeLanguageCode('fi')).toBe('FIN');
    expect(privateService.normalizeLanguageCode('MUL')).toBe('MUL');
    expect(privateService.normalizeLanguageCode('unknown')).toBe('UNKNOWN');
  });

  it('detects XML languages and marks TED XML notice as multilingual', async () => {
    const result = await service.extractAndPrepareText({
      sourceUrl: 'https://ted.europa.eu/en/notice/756265-2023/xml',
      filename: '756265-2023.xml',
      mimeType: 'application/xml',
      language: 'MUL',
      documentType: TenderSourceDocumentType.TED_XML_NOTICE,
      content: Buffer.from(`
        <notice>
          <title xml:lang="en">English title</title>
          <title languageID="FIN">Finnish title</title>
        </notice>
      `),
      buyerCountry: 'FIN',
    });

    expect(result.detectedLanguages).toEqual(['ENG', 'FIN']);
    expect(result.isMultilingual).toBe(true);
    expect(result.rawText).toContain('English title');
    expect(result.rawText).toContain('Finnish title');
  });

  it('filters non-preferred XML language nodes when possible', async () => {
    const result = await service.extractAndPrepareText({
      sourceUrl: 'https://ted.europa.eu/en/notice/756265-2023/xml',
      filename: '756265-2023.xml',
      mimeType: 'application/xml',
      language: 'MUL',
      documentType: TenderSourceDocumentType.TED_XML_NOTICE,
      content: `
        <notice>
          <title xml:lang="en">English title</title>
          <title xml:lang="de">German title</title>
          <description languageID="FIN">Finnish description</description>
        </notice>
      `,
      buyerCountry: 'FIN',
    });

    expect(result.rawText).toContain('English title');
    expect(result.rawText).toContain('Finnish description');
    expect(result.rawText).not.toContain('German title');
  });

  it('returns XML fallback text and warning for malformed XML', async () => {
    const result = await service.extractAndPrepareText({
      sourceUrl: 'https://ted.europa.eu/en/notice/756265-2023/xml',
      filename: '756265-2023.xml',
      mimeType: 'application/xml',
      language: 'MUL',
      documentType: TenderSourceDocumentType.TED_XML_NOTICE,
      content: '<notice><title xml:lang="en">Fallback text</title',
      buyerCountry: 'FIN',
    });

    expect(result.rawText).toContain('Fallback text');
    expect(result.warnings).toContain(
      'XML multilingual filtering used fallback mode',
    );
  });

  it('removes non-content HTML elements and detects html lang', async () => {
    const result = await service.extractAndPrepareText({
      sourceUrl: 'https://example.test/notice.html',
      filename: 'notice.html',
      mimeType: 'text/html',
      language: 'UNKNOWN',
      documentType: TenderSourceDocumentType.TED_HTML_NOTICE,
      content: `
        <html lang="fi">
          <head><style>.x { color: red; }</style><script>bad()</script></head>
          <body>
            <header>Header</header>
            <nav>Navigation</nav>
            <main><h1>Tender title</h1><p>Body text</p></main>
            <footer>Footer</footer>
          </body>
        </html>
      `,
    });

    expect(result.rawText).toContain('Tender title');
    expect(result.rawText).toContain('Body text');
    expect(result.rawText).not.toContain('Header');
    expect(result.rawText).not.toContain('Navigation');
    expect(result.rawText).not.toContain('Footer');
    expect(result.detectedLanguages).toEqual(['FIN']);
  });
});
