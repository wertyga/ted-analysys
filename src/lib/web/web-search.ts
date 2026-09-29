import { Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';

export interface WebSearchResult {
  url: string;
  title: string;
}

export interface FetchedPage {
  url: string;
  title: string;
  publishedAt: string | null;
  // Whole page text, whitespace collapsed
  text: string;
}

const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 3_000_000;
const MAX_PDF_BYTES = 8_000_000;
// Brave free plan allows 1 request per second
const BRAVE_MIN_INTERVAL_MS = 1100;

const logger = new Logger('WebSearch');

let braveQueue: Promise<unknown> = Promise.resolve();
let lastBraveCallAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  // Brave explains quota and auth errors in the body: {"error":{"detail":"..."}}
  const data: unknown = axios.isAxiosError(error)
    ? error.response?.data
    : undefined;
  const detail =
    data && typeof data === 'object' && 'error' in data
      ? (data.error as { detail?: unknown } | undefined)?.detail
      : undefined;

  return typeof detail === 'string' ? `${message}: ${detail}` : message;
};

export const isWebSearchEnabled = (): boolean =>
  Boolean(process.env.BRAVE_API_KEY?.trim());

// Calls are serialized, so parallel callers can't break the rate limit
function throttleBrave<T>(call: () => Promise<T>): Promise<T> {
  const run = braveQueue.then(async () => {
    const wait = lastBraveCallAt + BRAVE_MIN_INTERVAL_MS - Date.now();

    if (wait > 0) {
      await sleep(wait);
    }

    lastBraveCallAt = Date.now();

    return call();
  });

  braveQueue = run.catch(() => undefined);

  return run;
}

export type WebErrorHandler = (message: string) => void;

export async function braveSearch(
  query: string,
  count = 5,
  onError?: WebErrorHandler,
): Promise<WebSearchResult[]> {
  if (!isWebSearchEnabled()) {
    return [];
  }

  try {
    const response = await throttleBrave(() =>
      axios.get<{
        web?: { results?: { url?: unknown; title?: unknown }[] };
      }>(BRAVE_SEARCH_ENDPOINT, {
        params: { q: query, count },
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': process.env.BRAVE_API_KEY,
        },
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
    const results = response.data?.web?.results;

    if (!Array.isArray(results)) return [];

    return results
      .map((result) => ({
        url: typeof result.url === 'string' ? result.url : '',
        title: typeof result.title === 'string' ? result.title : '',
      }))
      .filter((result) => Boolean(result.url));
  } catch (error) {
    logger.warn(
      `Brave Search failed for query "${query}": ${errorMessage(error)}`,
    );
    onError?.(errorMessage(error));

    return [];
  }
}

export async function fetchPage(
  url: string,
  options: {
    maxChars?: number;
    allowPdf?: boolean;
    onError?: WebErrorHandler;
  } = {},
): Promise<FetchedPage | null> {
  const maxChars = options.maxChars ?? 6000;

  try {
    const response = await axios.get<ArrayBuffer>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'arraybuffer',
      maxContentLength: options.allowPdf ? MAX_PDF_BYTES : MAX_HTML_BYTES,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TenderwizeBot/1.0; +https://tenderwize.com)',
        Accept: options.allowPdf ? 'text/html, application/pdf' : 'text/html',
      },
    });
    const data = Buffer.from(response.data);
    const contentTypeHeader: unknown = response.headers['content-type'];
    const contentType =
      typeof contentTypeHeader === 'string' ? contentTypeHeader : '';
    const isPdf =
      contentType.includes('application/pdf') ||
      data.subarray(0, 5).toString() === '%PDF-';

    if (isPdf) {
      return options.allowPdf ? await parsePdfPage(url, data, maxChars) : null;
    }

    return parseHtmlPage(url, data.toString('utf8'), maxChars);
  } catch (error) {
    logger.debug(`Failed to fetch ${url}: ${errorMessage(error)}`);
    options.onError?.(errorMessage(error));

    return null;
  }
}

function parseHtmlPage(
  url: string,
  html: string,
  maxChars: number,
): FetchedPage | null {
  const $ = cheerio.load(html);

  $('script, style, nav, footer, header, noscript, iframe').remove();

  const title =
    $('title').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    url;
  const publishedAt =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="date"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    null;
  const text = (
    $('article').text() ||
    $('main').text() ||
    $('body').text() ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);

  if (!text) return null;

  return {
    url,
    title,
    publishedAt: publishedAt ? publishedAt.trim() : null,
    text,
  };
}

async function parsePdfPage(
  url: string,
  data: Buffer,
  maxChars: number,
): Promise<FetchedPage | null> {
  const parser = new PDFParse({ data });

  try {
    const { text } = await parser.getText();
    const normalized = (text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars);

    if (!normalized) return null;

    return {
      url,
      title: decodeURIComponent(url.split('/').pop() || url),
      publishedAt: null,
      text: normalized,
    };
  } finally {
    await parser.destroy();
  }
}
