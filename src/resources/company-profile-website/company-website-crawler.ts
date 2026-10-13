import axios from 'axios';
import * as cheerio from 'cheerio';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { getSafeErrorMessage } from '@/utils';
import { COMPANY_PROFILE_WEBSITE_CONFIG } from '@/config/company-profile-website.config';
import {
  CompanyWebsiteCrawlResult,
  CompanyWebsitePage,
} from './company-profile-website.types';

const { crawl: CRAWL, context: CONTEXT } = COMPANY_PROFILE_WEBSITE_CONFIG;

export class CompanyWebsiteFetchError extends Error {}

/* ---------------------------------------------------------------------------
 * SSRF protection: the URL comes from the user, so the server must never
 * connect to loopback, private, link-local or otherwise internal addresses.
 * The check runs in the socket `lookup`, so it also covers every redirect hop
 * and DNS rebinding. IP-literal hosts skip `lookup` and are checked by
 * `assertSafeUrl` before the request and before each redirect.
 * ------------------------------------------------------------------------- */

const blockedAddresses = new net.BlockList();

for (const [prefix, length] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(prefix, length, 'ipv4');
}

for (const [prefix, length] of [
  ['::', 128],
  ['::1', 128],
  // No ::ffff:0:0/96 here: BlockList checks IPv4-mapped addresses against
  // the IPv4 rules itself, and that subnet would block every IPv4 address.
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedAddresses.addSubnet(prefix, length, 'ipv6');
}

const isPublicAddress = (address: string): boolean => {
  const family = net.isIP(address);

  if (!family) {
    return false;
  }

  return !blockedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '');
      return;
    }

    if (
      !addresses.length ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      callback(
        new CompanyWebsiteFetchError(
          `${hostname} resolves to a non-public address`,
        ),
        '',
      );
      return;
    }

    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

const httpAgent = new http.Agent({ lookup: safeLookup });
const httpsAgent = new https.Agent({ lookup: safeLookup });

const assertSafeUrl = (value: string): URL => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new CompanyWebsiteFetchError(`Invalid URL: ${value}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CompanyWebsiteFetchError('Only http and https URLs are allowed');
  }

  if (url.username || url.password) {
    throw new CompanyWebsiteFetchError('URLs with credentials are not allowed');
  }

  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new CompanyWebsiteFetchError('Only default ports are allowed');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host) && !isPublicAddress(host)) {
    throw new CompanyWebsiteFetchError('Non-public addresses are not allowed');
  }

  return url;
};

/** Accepts "example.com", "www.example.com/about" etc. and adds https://. */
export const normalizeWebsiteUrl = (value: string): string => {
  const trimmed = value.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = assertSafeUrl(withProtocol);

  if (!url.hostname.includes('.') && !net.isIP(url.hostname)) {
    throw new CompanyWebsiteFetchError(`Invalid website address: ${value}`);
  }

  url.hash = '';

  return url.toString();
};

const fetchHtml = async (
  url: string,
): Promise<{ finalUrl: string; html: string }> => {
  assertSafeUrl(url);

  let response;

  try {
    response = await axios.get<string>(url, {
      timeout: CRAWL.requestTimeoutMs,
      responseType: 'text',
      maxContentLength: CRAWL.maxResponseBytes,
      maxRedirects: CRAWL.maxRedirects,
      httpAgent,
      httpsAgent,
      proxy: false,
      beforeRedirect: (options: { href?: string }) => {
        if (options.href) {
          assertSafeUrl(options.href);
        }
      },
      validateStatus: () => true,
      headers: {
        'User-Agent': CRAWL.userAgent,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (error: unknown) {
    throw new CompanyWebsiteFetchError(
      `Could not load ${url}: ${getSafeErrorMessage(error)}`,
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw new CompanyWebsiteFetchError(
      `${url} responded with HTTP ${response.status}`,
    );
  }

  const contentType = String(response.headers['content-type'] ?? '');

  if (contentType && !/html/i.test(contentType)) {
    throw new CompanyWebsiteFetchError(`${url} is not an HTML page`);
  }

  const finalUrl =
    (response.request as { res?: { responseUrl?: string } } | undefined)?.res
      ?.responseUrl ?? url;

  return {
    finalUrl,
    html: typeof response.data === 'string' ? response.data : '',
  };
};

/* ---------------------------------------------------------------------------
 * Page parsing
 * ------------------------------------------------------------------------- */

interface ParsedPage extends CompanyWebsitePage {
  links: Array<{ url: string; text: string }>;
}

const BLOCK_ELEMENTS =
  'p, div, li, h1, h2, h3, h4, h5, h6, tr, td, th, dd, dt, section, article, header, footer, address, blockquote';

const JSON_LD_ORGANIZATION = /Organization|Corporation|Business|Company/i;

const parsePage = (html: string, url: string): ParsedPage => {
  const $ = cheerio.load(html);

  const jsonLd = $('script[type="application/ld+json"]')
    .map((_, element) => $(element).text().trim())
    .get()
    .filter((value) => JSON_LD_ORGANIZATION.test(value))
    .join('\n')
    .slice(0, CONTEXT.maxJsonLdChars);

  const hreflangs = $('link[rel="alternate"][hreflang]')
    .map((_, element) => $(element).attr('hreflang'))
    .get()
    .filter((value): value is string => !!value && value !== 'x-default');

  const links = $('a[href]')
    .map((_, element) => {
      try {
        return {
          url: new URL($(element).attr('href') ?? '', url).toString(),
          text: $(element).text().replace(/\s+/g, ' ').trim(),
        };
      } catch {
        return undefined;
      }
    })
    .get()
    .filter(Boolean);

  const title = $('title').first().text().trim() || undefined;
  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    undefined;
  const lang = $('html').attr('lang')?.trim() || undefined;

  $(
    'script, style, noscript, svg, iframe, template, nav, form, button',
  ).remove();
  $('br').replaceWith('\n');
  $(BLOCK_ELEMENTS).append('\n');

  const text = $('body')
    .text()
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  return { url, title, description, lang, hreflangs, jsonLd, text, links };
};

/* ---------------------------------------------------------------------------
 * Picking which internal pages to read
 * ------------------------------------------------------------------------- */

/**
 * Page groups that carry profile facts, with path/anchor keywords in the
 * main EU languages. One page per group is taken first, then the rest by
 * score, each group capped by `maxPages` so that one section (e.g. every
 * subpage of "about") cannot fill the whole budget.
 */
const PAGE_GROUPS: Array<{
  name: string;
  weight: number;
  maxPages: number;
  pattern: RegExp;
}> = [
  {
    name: 'about',
    weight: 10,
    maxPages: 2,
    pattern:
      /about|who-?we-?are|company|o-?nas|o-?firmie|firma|uber-?uns|ueber-?uns|unternehmen|a-?propos|qui-?sommes|chi-?siamo|azienda|sobre|quienes|empresa|over-?ons|historia|history|geschichte/i,
  },
  {
    name: 'services',
    weight: 9,
    maxPages: 4,
    pattern:
      /services?|uslugi|usługi|leistungen|dienstleistung|prestations|servizi|servicios|diensten|products?|produkty|produkte|produits|prodotti|productos|producten|solutions?|rozwiazania|losungen|loesungen|offer|oferta|angebot|offre|what-?we-?do|co-?robimy|capabilit|competenc|kompetenc|expertise|specjalizac|dzialalnosc|działalność|activit|business-?areas|obszary|segment|grupa|group/i,
  },
  {
    name: 'certifications',
    weight: 8,
    maxPages: 2,
    pattern:
      /certif|zertifi|certyfikat|quality|jakosc|jakość|qualitaet|qualitat|qualite|qualita|calidad|iso-?\d|accreditation|compliance|management-?system|system-?zarzadzania|zarządzania/i,
  },
  {
    name: 'references',
    weight: 7,
    maxPages: 2,
    pattern:
      /references?|referencje|referenzen|projects?|projekty|projekte|projets|progetti|proyectos|realizacje|portfolio|case-?stud|clients?|klienci|kunden|customers/i,
  },
  {
    name: 'industries',
    weight: 6,
    maxPages: 2,
    pattern:
      /industr|sectors?|branze|branzen|branchen|secteurs|settori|sectores|markets/i,
  },
  {
    name: 'contact',
    weight: 5,
    maxPages: 1,
    pattern:
      /contact|kontakt|impressum|imprint|kontakty|contatti|contacto|legal-?notice/i,
  },
];

const SKIPPED_PATH =
  /\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|docx?|xlsx?|pptx?|mp4|mp3)$|privacy|cookie|polityka|datenschutz|rodo|gdpr|login|signin|register|cart|basket|checkout|wp-admin|wp-login|\/tag\/|\/author\//i;

/**
 * Path words of sections with nothing for a procurement profile: investor
 * relations, careers, news/press, foundations, awards, management board,
 * mission statements. Matched as whole words of the path, so "board" does
 * not hit "dashboard" and "zarzad" does not hit "system-zarzadzania".
 */
const LOW_VALUE_PATH = new RegExp(
  `(^|[/_.-])(${[
    'investors?',
    'investor-relations',
    'inwestorskie',
    'inwestorzy',
    'akcjonariat',
    'gielda',
    'obligacje',
    'walne',
    'careers?',
    'kariera',
    'praca',
    'jobs',
    'karriere',
    'emploi',
    'news',
    'aktualnosci',
    'blog',
    'press',
    'presse',
    'prasa',
    'media',
    'mediow',
    'events',
    'wydarzenia',
    'kalendarium',
    'foundation',
    'fundacja',
    'stiftung',
    'awards?',
    'nagrody',
    'wyroznienia',
    'auszeichnungen',
    'wladze',
    'zarzad',
    'rada-nadzorcza',
    'board',
    'management-board',
    'vorstand',
    'mission',
    'misja',
    'vision',
    'wizja',
    'sitemap',
    'mapa-serwisu',
  ].join('|')})(?=$|[/_.-])`,
  'i',
);

/** URL path without the file extension (/o-firmie.html -> /o-firmie). */
const pathName = (path: string) => path.replace(/\.[a-z\d]+$/i, '');

const LOCALE_SEGMENT = /^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/i;

const siteHost = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '');

const pageKey = (url: URL) =>
  `${siteHost(url)}${url.pathname.replace(/\/+$/, '') || '/'}`;

const selectRelevantLinks = (start: ParsedPage, limit: number): string[] => {
  const startUrl = new URL(start.url);
  const startLocale = startUrl.pathname
    .match(LOCALE_SEGMENT)?.[1]
    ?.toLowerCase();
  const candidates = new Map<
    string,
    { url: string; group: string; score: number }
  >();

  for (const link of start.links) {
    let url: URL;

    try {
      url = new URL(link.url);
    } catch {
      continue;
    }

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      siteHost(url) !== siteHost(startUrl) ||
      SKIPPED_PATH.test(url.pathname) ||
      LOW_VALUE_PATH.test(pathName(decodeURIComponent(url.pathname)))
    ) {
      continue;
    }

    const key = pageKey(url);

    if (key === pageKey(startUrl)) {
      continue;
    }

    // The page's own name (last path segment, link text) decides the group;
    // the parent section is only a fallback, e.g. /grupa-x/budownictwo-ogolne
    // is a services page because of its parent "grupa-x".
    const segments = pathName(decodeURIComponent(url.pathname))
      .split('/')
      .filter(Boolean);
    const ownName = `${segments.at(-1) ?? ''} ${link.text}`;
    const parentPath = segments.slice(0, -1).join('/');
    const ownGroup = PAGE_GROUPS.find(({ pattern }) => pattern.test(ownName));
    const group =
      ownGroup ?? PAGE_GROUPS.find(({ pattern }) => pattern.test(parentPath));

    if (!group) {
      continue;
    }

    const depth = url.pathname.split('/').filter(Boolean).length;
    const locale = url.pathname.match(LOCALE_SEGMENT)?.[1]?.toLowerCase();
    // Another language version of the same site adds nothing new.
    const otherLocale = !!locale && !!startLocale && locale !== startLocale;
    const score =
      group.weight -
      (ownGroup ? 0 : 1) -
      Math.max(0, depth - 1) -
      (url.search ? 2 : 0) -
      (otherLocale || (locale && !startLocale) ? 6 : 0);

    const existing = candidates.get(key);

    if (!existing || existing.score < score) {
      url.hash = '';
      candidates.set(key, { url: url.toString(), group: group.name, score });
    }
  }

  const sorted = [...candidates.values()].sort((a, b) => b.score - a.score);
  const selected: string[] = [];
  const groupCounts = new Map<string, number>();
  const take = (candidate: { url: string; group: string }) => {
    selected.push(candidate.url);
    groupCounts.set(
      candidate.group,
      (groupCounts.get(candidate.group) ?? 0) + 1,
    );
  };

  for (const candidate of sorted) {
    if (!groupCounts.has(candidate.group)) {
      take(candidate);
    }
  }

  for (const candidate of sorted) {
    if (selected.length >= limit) {
      break;
    }

    const maxPages =
      PAGE_GROUPS.find(({ name }) => name === candidate.group)?.maxPages ?? 1;

    if (
      !selected.includes(candidate.url) &&
      (groupCounts.get(candidate.group) ?? 0) < maxPages
    ) {
      take(candidate);
    }
  }

  return selected.slice(0, limit);
};

/* ---------------------------------------------------------------------------
 * Crawl
 * ------------------------------------------------------------------------- */

/**
 * Reads the start page and the most profile-relevant internal pages
 * (about, services/products, certifications, references, contact).
 * Only server-rendered HTML is read; JavaScript is not executed.
 */
export const crawlCompanyWebsite = async (
  inputUrl: string,
): Promise<CompanyWebsiteCrawlResult> => {
  const startUrl = normalizeWebsiteUrl(inputUrl);
  const home = await fetchHtml(startUrl);
  const start = parsePage(home.html, home.finalUrl);
  const warnings: string[] = [];
  const extraUrls = selectRelevantLinks(start, CRAWL.maxExtraPages);
  const extraPages: ParsedPage[] = [];

  for (let index = 0; index < extraUrls.length; index += CRAWL.concurrency) {
    const batch = extraUrls.slice(index, index + CRAWL.concurrency);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const page = await fetchHtml(url);
        return parsePage(page.html, page.finalUrl);
      }),
    );

    results.forEach((result, batchIndex) => {
      if (result.status === 'fulfilled') {
        extraPages.push(result.value);
      } else {
        warnings.push(
          result.reason instanceof CompanyWebsiteFetchError
            ? result.reason.message
            : `Could not load ${batch[batchIndex]}`,
        );
      }
    });
  }

  // Header/footer blocks repeat on every page: keep each line only once.
  const seenLines = new Set<string>();
  const seenPages = new Set<string>();
  const pages: CompanyWebsitePage[] = [];

  for (const page of [start, ...extraPages]) {
    const key = pageKey(new URL(page.url));

    if (seenPages.has(key)) {
      continue;
    }

    seenPages.add(key);

    const text = page.text
      .split('\n')
      .filter((line) => {
        if (seenLines.has(line)) {
          return false;
        }

        seenLines.add(line);
        return true;
      })
      .join('\n')
      .slice(0, CONTEXT.maxCharsPerPage);

    pages.push({
      url: page.url,
      title: page.title,
      description: page.description,
      lang: page.lang,
      hreflangs: page.hreflangs,
      jsonLd: page.jsonLd,
      text,
    });
  }

  return { startUrl: start.url, pages, warnings };
};
