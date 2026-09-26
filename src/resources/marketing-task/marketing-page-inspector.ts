import axios from 'axios';
import * as cheerio from 'cheerio';
import { getSafeErrorMessage } from '@/utils';
import { MarketingPageInspection } from './marketing-task.types';

const REQUEST_TIMEOUT_MS = 10000;
const MAX_HEADINGS = 15;

const countMentions = (text: string | undefined, needle: string) => {
  if (!text || !needle) return 0;

  return text.toLowerCase().split(needle).length - 1;
};

/**
 * Downloads the live page and extracts what an SEO task usually changes
 * (title, meta description, headings, canonical, robots, structured data),
 * so the AI can tell whether the work is actually on the site.
 */
export const inspectMarketingPage = async (
  url: string,
  query?: string | null,
): Promise<MarketingPageInspection> => {
  try {
    const response = await axios.get<string>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text',
      maxContentLength: 5_000_000,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TenderwizeBot/1.0; +https://tenderwize.com)',
        Accept: 'text/html',
      },
    });

    const $ = cheerio.load(
      typeof response.data === 'string' ? response.data : '',
    );
    const structuredDataTypes = new Set<string>();

    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const data: unknown = JSON.parse($(element).text());
        const nodes = (Array.isArray(data) ? data : [data]).flatMap((node) =>
          node && typeof node === 'object' && '@graph' in node
            ? (node as { '@graph': unknown[] })['@graph']
            : [node],
        );

        for (const node of nodes) {
          const type = (node as { '@type'?: unknown } | null)?.['@type'];
          for (const value of Array.isArray(type) ? type : [type]) {
            if (typeof value === 'string') structuredDataTypes.add(value);
          }
        }
      } catch {
        // Invalid JSON-LD is ignored; it is not what the task checks.
      }
    });

    const text = (selector: string) =>
      $(selector)
        .map((_, element) => $(element).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean)
        .slice(0, MAX_HEADINGS);
    const title = $('title').first().text().trim() || undefined;
    const metaDescription =
      $('meta[name="description"]').attr('content')?.trim() || undefined;
    const h1 = text('h1');

    $('script, style, noscript, iframe, svg').remove();

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const needle = query?.trim().toLowerCase() ?? '';

    return {
      url,
      httpStatus: response.status,
      title,
      metaDescription,
      h1,
      h2: text('h2'),
      canonical: $('link[rel="canonical"]').attr('href') || undefined,
      robots: $('meta[name="robots"]').attr('content') || undefined,
      structuredDataTypes: [...structuredDataTypes],
      wordCount: bodyText ? bodyText.split(' ').length : 0,
      ...(needle && {
        queryMentions: {
          title: countMentions(title, needle),
          metaDescription: countMentions(metaDescription, needle),
          h1: countMentions(h1.join(' '), needle),
          body: countMentions(bodyText, needle),
        },
      }),
    };
  } catch (error) {
    return {
      url,
      error: getSafeErrorMessage(error),
      h1: [],
      h2: [],
      structuredDataTypes: [],
      wordCount: 0,
    };
  }
};
