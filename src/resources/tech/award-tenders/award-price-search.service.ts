import { Injectable, Logger } from '@nestjs/common';
import { LlmAnalysisService } from '@/llm/llm-analysis.service';
import {
  braveSearch,
  fetchPage,
  FetchedPage,
  isWebSearchEnabled,
} from '@/lib/web/web-search';
import type {
  AwardPriceFinding,
  AwardPriceSearchError,
  AwardPriceSearchResult,
} from '@/resources/award-tender/schemas';
import {
  extractMoneySnippets,
  textContainsAmount,
} from '@/resources/award-tender/utils';
import { getSafeErrorMessage, isRecord } from '@/utils';

export type AwardPriceSearchInput = {
  // Procedure title without the "Country – CPV –" prefix
  title: string;
  buyerName: string;
  winnerNames: string[];
  // ISO 3166 alpha-3
  country: string | null;
  publishedValue: { amount: number | null; currency: string | null };
  estimatedValue: { amount: number | null; currency: string | null };
};

const RESULTS_PER_QUERY = 6;
const MAX_PAGES = 5;
const MAX_QUERIES = 3;
const MAX_PAGE_CHARS = 300_000;
const PAGE_HEAD_CHARS = 600;
const MAX_TITLE_IN_QUOTES = 90;
const MAX_FINDINGS = 5;

// They repeat the TED notice, so they only echo the wrong value back
const MIRROR_DOMAINS = [
  'ted.europa.eu',
  'tenderwize.com',
  'opentender.eu',
  'tendersontime.com',
  'globaltenders.com',
  'tendersinfo.com',
  'tendersglobal.net',
  'tenderimpulse.com',
  'bidstats.uk',
];

// "contract award" in the local language helps to reach national registers
const AWARD_KEYWORD_BY_COUNTRY: Record<string, string> = {
  PRT: 'contrato adjudicação',
  ESP: 'adjudicación contrato',
  ITA: 'aggiudicazione importo',
  FRA: 'attribution marché montant',
  BEL: 'attribution marché',
  LUX: 'attribution marché',
  DEU: 'Zuschlag Auftragswert',
  AUT: 'Zuschlag Auftragswert',
  NLD: 'gunning opdracht',
  POL: 'umowa wartość',
  CZE: 'smlouva cena',
  SVK: 'zmluva cena',
  ROU: 'contract atribuire valoare',
  HRV: 'ugovor vrijednost',
  SVN: 'pogodba vrednost',
  HUN: 'szerződés érték',
  GRC: 'σύμβαση κατακύρωση',
  BGR: 'договор стойност',
  SWE: 'avtal tilldelning',
  DNK: 'kontrakt tildeling',
  FIN: 'sopimus hankinta',
  NOR: 'kontrakt tildeling',
  EST: 'leping maksumus',
  LVA: 'līgums līgumcena',
  LTU: 'sutartis kaina',
};

const QUERIES_PROMPT = [
  'Write web search queries to find the awarded price of ONE public contract: a national contract register, the transparency page of the buyer, meeting minutes or local news.',
  'Rules:',
  '- 3 queries, 3-8 words each, in the language of `country`.',
  '- Use the short distinctive buyer name (drop legal forms like S.p.A., EIM, LDA, SRL, GmbH), distinctive subject words and place names; the short name of the winner in one query.',
  '- Drop generic procurement words ("contract for", "services of", "Empreitada", "Affidamento del servizio di").',
  '- Quotes only around a distinctive 2-4 word phrase, never around the whole title.',
  'Return JSON only: {"queries":["...","...","..."]}.',
].join('\n');

const PROMPT = [
  'You look for the real price of ONE specific public contract in excerpts of web pages.',
  'The value published in TED (`contract.publishedValue`) is suspected to be wrong, so do not trust it and ignore pages that simply repeat it.',
  'Return only prices that clearly refer to this contract: same buyer and subject (and the same winner when it is known). Skip other contracts of the same buyer.',
  'For each price:',
  '- `url`: the page url exactly as given;',
  '- `quote`: text copied EXACTLY from the excerpt, max 200 characters, containing the number;',
  '- `amount`: the number from the quote as a plain JSON number, e.g. "3.199.999,06 €" -> 3199999.06;',
  '- `currency`: ISO code;',
  '- `vat`: "excluded", "included" or "unknown";',
  '- `scope`: "contract" (the awarded price), "lot" (price of one lot) or "estimate" (budget / base price before the award).',
  'Never compute, sum, convert or guess numbers. Every amount must be written in its quote.',
  'Return JSON only: {"prices":[{"url":"...","quote":"...","amount":0,"currency":"EUR","vat":"excluded","scope":"contract"}]}. Return {"prices":[]} when nothing qualifies, which is normal.',
].join('\n');

const normalizeText = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();

const isMirror = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase();

    return MIRROR_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return true;
  }
};

const shortTitle = (title: string) => {
  if (title.length <= MAX_TITLE_IN_QUOTES) {
    return title;
  }

  return title.slice(0, title.lastIndexOf(' ', MAX_TITLE_IN_QUOTES));
};

/**
 * Searches the web for the price of an award whose TED value looks wrong.
 * Every finding is checked against the fetched page, so a price the model
 * made up never gets out of here.
 */
@Injectable()
export class AwardPriceSearchService {
  private readonly logger = new Logger(AwardPriceSearchService.name);

  constructor(private readonly llmAnalysisService: LlmAnalysisService) {}

  isEnabled(): boolean {
    return isWebSearchEnabled();
  }

  async search(input: AwardPriceSearchInput): Promise<AwardPriceSearchResult> {
    const errors: AwardPriceSearchError[] = [];
    const queries = await this.buildQueries(input, errors);
    const urls: string[] = [];

    for (const query of queries) {
      const results = await braveSearch(query, RESULTS_PER_QUERY, (message) =>
        errors.push({ stage: 'search', message, target: query }),
      );

      for (const result of results) {
        if (!urls.includes(result.url) && !isMirror(result.url)) {
          urls.push(result.url);
        }
      }
    }

    const pages: FetchedPage[] = [];

    for (const url of urls) {
      if (pages.length >= MAX_PAGES) {
        break;
      }

      const page = await fetchPage(url, {
        maxChars: MAX_PAGE_CHARS,
        allowPdf: true,
        onError: (message) =>
          errors.push({ stage: 'fetch', message, target: url }),
      });

      if (page && extractMoneySnippets(page.text)) {
        pages.push(page);
      }
    }

    if (!pages.length) {
      return { queries, pagesFetched: 0, findings: [], errors };
    }

    try {
      const response = await this.llmAnalysisService.createGeneralJsonResponse(
        PROMPT,
        JSON.stringify(
          {
            contract: input,
            pages: pages.map((page) => ({
              url: page.url,
              title: page.title,
              head: page.text.slice(0, PAGE_HEAD_CHARS),
              excerpts: extractMoneySnippets(page.text),
            })),
          },
          null,
          2,
        ),
      );

      return {
        queries,
        pagesFetched: pages.length,
        findings: this.verifyFindings(response, pages),
        errors,
      };
    } catch (error) {
      this.logger.warn(
        `Price extraction failed for "${input.title}": ${getSafeErrorMessage(error)}`,
      );
      errors.push({
        stage: 'llm',
        message: `Price extraction: ${getSafeErrorMessage(error)}`,
        target: input.title,
      });

      return { queries, pagesFetched: pages.length, findings: [], errors };
    }
  }

  private async buildQueries(
    input: AwardPriceSearchInput,
    errors: AwardPriceSearchError[],
  ): Promise<string[]> {
    try {
      const response = await this.llmAnalysisService.createGeneralJsonResponse(
        QUERIES_PROMPT,
        JSON.stringify({
          title: input.title,
          buyerName: input.buyerName,
          winnerNames: input.winnerNames,
          country: input.country,
        }),
      );
      const queries =
        isRecord(response) && Array.isArray(response.queries)
          ? response.queries.filter(
              (query): query is string =>
                typeof query === 'string' && query.trim().length > 0,
            )
          : [];

      if (queries.length) {
        // The exact title still finds pages the short queries miss
        return [
          ...queries.slice(0, MAX_QUERIES),
          this.buildFallbackQueries(input)[0],
        ];
      }
    } catch (error) {
      this.logger.warn(
        `Query generation failed for "${input.title}": ${getSafeErrorMessage(error)}`,
      );
      errors.push({
        stage: 'llm',
        message: `Query generation: ${getSafeErrorMessage(error)}`,
        target: input.title,
      });
    }

    return this.buildFallbackQueries(input);
  }

  private buildFallbackQueries(input: AwardPriceSearchInput): string[] {
    const title = shortTitle(input.title);
    const winner = input.winnerNames[0];
    const keyword =
      AWARD_KEYWORD_BY_COUNTRY[input.country ?? ''] ?? 'contract award value';
    const queries = [`"${title}" ${input.buyerName}`];

    if (winner) {
      queries.push(`"${title}" ${winner}`);
      queries.push(`${input.buyerName} ${winner} ${keyword}`);
    } else {
      queries.push(`${input.buyerName} ${title} ${keyword}`);
    }

    return queries;
  }

  private verifyFindings(
    response: unknown,
    pages: FetchedPage[],
  ): AwardPriceFinding[] {
    const prices =
      isRecord(response) && Array.isArray(response.prices)
        ? response.prices
        : [];
    const findings: AwardPriceFinding[] = [];

    for (const price of prices) {
      if (!isRecord(price)) {
        continue;
      }

      const page = pages.find((p) => p.url === price.url);
      const quote = typeof price.quote === 'string' ? price.quote.trim() : '';
      const amount = Number(price.amount);
      const currency =
        typeof price.currency === 'string'
          ? price.currency.trim().toUpperCase()
          : '';

      // The quote must be on the page and must hold the amount
      if (
        !page ||
        !quote ||
        !currency ||
        !normalizeText(page.text).includes(normalizeText(quote)) ||
        !textContainsAmount(quote, amount)
      ) {
        continue;
      }

      findings.push({
        url: page.url,
        pageTitle: page.title,
        quote,
        amount,
        currency,
        vat:
          price.vat === 'excluded' || price.vat === 'included'
            ? price.vat
            : 'unknown',
        scope:
          price.scope === 'lot' || price.scope === 'estimate'
            ? price.scope
            : 'contract',
      });
    }

    return findings.slice(0, MAX_FINDINGS);
  }
}
