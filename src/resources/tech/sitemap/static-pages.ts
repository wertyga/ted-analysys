const COMPARE_LOCALES = ['en', 'de', 'fr', 'pl'];

export const STATIC_SITEMAP_PATHS: ReadonlyArray<{
  path: string;
  // If set, the page is included only for these locales
  locales?: readonly string[];
}> = [
  { path: '' },

  { path: 'guides' },

  { path: 'tender-search' },
  { path: 'industries' },
  { path: 'countries' },
  { path: 'explore' },

  { path: 'how-to-find-eu-tenders' },
  { path: 'how-to-evaluate-a-tender-opportunity' },
  { path: 'how-to-analyze-tender-documents-with-ai' },
  { path: 'common-tender-requirements-in-europe' },

  { path: 'compare', locales: COMPARE_LOCALES },
  {
    path: 'compare/best-tender-alert-services-europe',
    locales: COMPARE_LOCALES,
  },

  { path: 'privacy' },
  { path: 'terms' },
  { path: 'cookies' },
];
