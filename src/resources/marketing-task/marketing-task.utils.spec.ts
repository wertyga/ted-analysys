import { detectPageIssues } from './marketing-page-inspector';
import {
  MarketingPageInspection,
  SitePageTemplate,
} from './marketing-task.types';
import {
  classifyPage,
  isIndexableLocaleVersion,
  toDefaultLocalePath,
} from './marketing-task.utils';

const SITE = 'https://tenderwize.com';

describe('classifyPage', () => {
  it.each([
    ['/en', SitePageTemplate.home],
    ['/en/tenders/100552-2026', SitePageTemplate.tender],
    ['/en/award-tenders/123-2026', SitePageTemplate.award_tender],
    ['/en/award-tenders', SitePageTemplate.award_directory],
    ['/de/award-tenders/country', SitePageTemplate.award_directory],
    ['/de/award-tenders/country/germany', SitePageTemplate.award_directory],
    ['/en/buyers', SitePageTemplate.buyer_list],
    ['/en/buyers/6a4bc14540390102973c42ba', SitePageTemplate.buyer],
    ['/en/industries/construction', SitePageTemplate.industry],
    ['/en/countries', SitePageTemplate.country_list],
    ['/en/germany/construction', SitePageTemplate.country_industry],
    ['/en/compare/best-tender-alert-services-europe', SitePageTemplate.compare],
    ['/en/how-to-find-eu-tenders', SitePageTemplate.guide],
    ['/en/tender-search', SitePageTemplate.tool],
    ['/en/pricing', SitePageTemplate.pricing],
    ['/en/privacy', SitePageTemplate.legal],
    ['/en/settings/billing', SitePageTemplate.app],
    ['/en/deep-analyses/100552-2026', SitePageTemplate.app],
    ['/en/dashboard/100552-2026', SitePageTemplate.app],
    ['/auth/google/callback', SitePageTemplate.app],
  ])('%s -> %s', (url, template) => {
    expect(classifyPage(`${SITE}${url}`).template).toBe(template);
  });
});

describe('isIndexableLocaleVersion', () => {
  it.each([
    ['/en/tenders/1-2026', true],
    ['/de/tenders/1-2026', false],
    ['/de/germany/construction', true],
    ['/ru/germany/construction', false],
    ['/pl/buyers', true],
    ['/pl/buyers/abc', false],
    ['/fr/compare', true],
    ['/something', true],
  ])('%s -> %s', (url, expected) => {
    expect(isIndexableLocaleVersion(url)).toBe(expected);
  });

  it('maps a localized path to its /en counterpart', () => {
    expect(toDefaultLocalePath(`${SITE}/de/tenders/1-2026`)).toBe(
      '/en/tenders/1-2026',
    );
  });
});

describe('detectPageIssues', () => {
  const page = (
    url: string,
    overrides: Partial<MarketingPageInspection> = {},
  ): MarketingPageInspection => ({
    url: `${SITE}${url}`,
    httpStatus: 200,
    title: 'Construction Tenders in Germany | Tenderwize',
    metaDescription: 'Find construction tenders in Germany.',
    h1: ['Construction Tenders in Germany'],
    h2: [],
    canonical: `${SITE}${url}`,
    robots: 'index, follow',
    htmlLang: url.split('/')[1],
    hreflangs: ['en', 'de', 'x-default'],
    structuredDataTypes: ['FAQPage'],
    wordCount: 800,
    ...overrides,
  });

  it('accepts the intentional noindex setup of a fallback locale', () => {
    expect(
      detectPageIssues(
        page('/de/tenders/1-2026', {
          robots: 'noindex, follow',
          canonical: `${SITE}/en/tenders/1-2026`,
          hreflangs: [],
          structuredDataTypes: [],
        }),
      ),
    ).toEqual([]);
  });

  it('flags a fallback locale that is indexable or canonicalised elsewhere', () => {
    const issues = detectPageIssues(
      page('/de/tenders/1-2026', {
        canonical: `${SITE}/de/tenders/1-2026`,
      }),
    );

    expect(issues).toEqual([
      expect.stringMatching(/^fallback_locale_indexable/),
      expect.stringMatching(/^fallback_locale_canonical/),
      'fallback_locale_has_hreflang',
    ]);
  });

  it('still flags noindex on an indexable locale version', () => {
    expect(
      detectPageIssues(
        page('/de/germany/construction', { robots: 'noindex, follow' }),
      ),
    ).toEqual([expect.stringMatching(/^noindex/)]);
  });

  it('marks app pages as not an SEO target', () => {
    expect(detectPageIssues(page('/en/settings/billing'))).toEqual([
      expect.stringMatching(/^not_a_seo_page/),
    ]);
  });
});
