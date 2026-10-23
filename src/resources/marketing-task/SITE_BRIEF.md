# Tenderwize site brief (context for the SEO agent)

Source of truth: frontend repo `ted-analysys-fe` (Next.js App Router, `next-intl`), backend repo `TED` (API, sitemaps). Keep this file in sync when routes, templates or indexing rules change. Last verified: 2026-09-30.

## Product

Tenderwize (tenderwize.com) is a SaaS for finding and AI-analyzing EU public tenders from TED (Tenders Electronic Daily). Audience: companies (SMEs to large bidders, bid managers, consultants) that bid for public contracts in Europe. Competitors listed on our compare page: Jorpex, Stotles, Tenderlake, Tendium, Mercell, Tracker Intelligence, TED itself.

Features (only these may be referenced in copy; do not invent others):
- Cross-country tender search over live TED notices, CPV/category, country, value and deadline filters.
- Basic AI summary of any tender (free), deep AI analysis of a tender vs the company profile: fit score, risks, requirements checklist, bid/no-bid recommendation (Pro).
- Company profile + document upload (certificates, references); automated matching of every new tender to the profile; AI opportunities feed; email alerts instant/daily/weekly by fit level (Pro).
- Wishlist (free: 5 tenders, Pro: unlimited).
- Buyer intelligence: contracting authority profiles (activity, top CPV, awarded suppliers, signals). Contractor (award winner) profiles. Contract award database with EUR-normalized values.

Plans: Free (search up to 20 results, basic AI summary, wishlist 5), Pro, Business. Payment via Freemius. Registration is free; all pricing CTAs say "Create free account". Safe differentiators for snippets: "free account", "AI analysis", "all EU countries", "daily TED data", counts of open tenders/awards when the page actually has them.

## Search demand

The SEO asset is the database-driven (programmatic) site: every tender, award, buyer, contractor, CPV industry and country is a page. Traffic is mostly long-tail, high-intent queries. Typical queries per template:
- tender: the notice subject, "<subject> tender <country>", the TED notice number.
- award_tender: "<subject> contract award <country>", "<company> won contract".
- buyer: "<authority name> tenders", "<authority> procurement".
- contractor: "<company> public contracts", "<company> awarded".
- industry: "<industry> tenders", "CPV <code>", "<industry> public procurement".
- country: "public tenders <country>", "<country> procurement portal".
- country_industry: "<industry> tenders <country>", in the local language on de/fr/pl.
- compare / guides: "tender alert service", "<competitor> alternative", "how to find EU tenders".

## Locales and indexing rules (intentional, do not "fix")

URL locale prefix is mandatory: `en | de | fr | pl | ru`. `/` 308-redirects to `/en`. Indexing is controlled by `seoRouting()` in `src/lib/seo/locale-indexing.ts` (frontend):

| Template | Indexable locales |
|---|---|
| country, industry, country_industry, buyer_list, contractor_list, compare (hub + articles), award_directory (`/award-tenders`, `/award-tenders/country[/{slug}]`) | en, de, fr, pl |
| everything else (home, tender, award_tender, buyer, contractor, guides, pricing, explore, tender-search, countries/industries index, legal) | en only |

- The same map is mirrored in the backend (`INDEXABLE_LOCALES` in `marketing-task.utils.ts`): on such pages the inspected `issues` only report deviations from this setup (`fallback_locale_indexable`, `fallback_locale_canonical`, `fallback_locale_has_hreflang`).
- Non-indexable locale versions are **deliberately** `noindex,follow`, have **no hreflang** and a **canonical to the `/en` version**. So `noindex`, `canonical_to_other_url` and `no_hreflang` on e.g. `/de/tenders/*`, `/fr/buyers/*`, `/pl/guides` are expected, not bugs. Their body content is often English fallback.
- `ru` is never indexable (business decision 2026-07), even where Russian copy exists. Never propose ru SEO tasks.
- Content gates (indexable locale but `noindex` with self-canonical): country/industry/country_industry pages with no active tenders, no tenders closed in 12 months and no awards in 12 months; unknown buyer/contractor/award ids; `/award-tenders?page=N` with N > 20 or any filter; `/award-tenders/country/{slug}` with fewer than 10 awards. Missing tender → real 404.
- Indexable pages emit hreflang for their indexable locales + `x-default` = `/en`.
- robots.txt disallows private app pages: dashboard, deep-analyses, opportunities, wishlist, settings, onboarding, checkout-redirect, login, register, `/auth/`, `/api/`.

## Page templates

`template` = the value used in the snapshot data (`classifyPage`). Title/meta patterns are what the code generates now; placeholders in braces are the fields that actually exist.

### tender — `/{locale}/tenders/{id}` (id like `100552-2026`, the TED notice number)
- One page per TED notice, hundreds of thousands of URLs, short-lived (submission deadline passes). SSR; en indexable only.
- Title: `{shortTitle} Tender in {country} | TED {id}` (cut to 70 chars; fallbacks `Public Procurement Tender in {country} | TED {id}`, `{shortTitle} Tender | TED {id}`). shortTitle = localized short title from the API (`shortTitle[locale]`, if ≤50 chars), else the main CPV category name. The "Tender in {country}" part is always English.
- Meta: `{title without suffix}. Buyer: {buyerName}. Deadline: {deadline}.`
- Blocks (SSR): H1 = notice title; Overview (AI summary, strengths/risks); Key requirements; Buyer (links to buyer page); Lots; Procurement details (reference metadata/IDs); Documents; Similar tenders (up to 6 active tenders by same CPV, or country + contract nature). For guests / Free users part of the AI analysis (eligibility criteria, required documents, extra insights) is replaced by locked blocks with a "Sign up and get Pro" CTA.
- Fields available for patterns: title, shortTitle, buyerName, buyer country, placeOfPerformance, cpvCodes + category name, contractNature (works/supplies/services), procedure type, estimatedValue (EUR), submissionDeadline, publication date, lots, documents.
- JSON-LD: BreadcrumbList, Dataset/CreativeWork, ItemList — but injected with `next/script`, so it is NOT a `<script type="application/ld+json">` tag in the server HTML (see Known issues).

### award_tender — `/{locale}/award-tenders/{id}`
- Contract award notice: who won, value, buyer. en indexable only.
- Title: `{category or title (≤45 chars)} Contract Award in {country} | TED {id}`. Meta: `Awarded by: {buyer}. Contract value: {value}. {n} winning supplier(s).`
- Blocks: H1 title, award values, buyer card (statistics, profile link), winners (link to contractor pages), lots.

### award_directory — `/{locale}/award-tenders`, `/{locale}/award-tenders/country`, `/{locale}/award-tenders/country/{slug}`
- Hub of contract awards: search + filters (GET form), stats, paginated table (contract/buyer/winner/country/value/date), blocks by category and by country, top buyers, "Explore awarded suppliers", SEO text, FAQ. Indexable en/de/fr/pl; `?page=2..20` self-canonical, filters and deeper pages noindex.

### buyer — `/{locale}/buyers/{id}` (id = Mongo ObjectId)
- Contracting authority profile. en indexable only.
- Title: `{name} | Public Buyer in {country} | Tenderwize` (country optional). Meta: `View procurement activity, tenders, awarded contracts, suppliers, procurement intelligence, contact details and purchasing history for {name}, a public buyer in {country}.`
- Blocks: H1 name; Profile overview; Procurement signals; Activity timeline; Top CPV / categories; Address; Identifiers; Procurement contact; About this public buyer profile; FAQ (6 generic questions, same on every buyer). Recent tenders and awards of the buyer.
- JSON-LD Organization/PostalAddress/WebPage via `next/script` (not in server HTML).

### contractor — `/{locale}/contractors/{id}`
- Award winner (supplier) profile. en indexable only.
- Title: `{name} | {country} Public Procurement Contractor | Tenderwize`. Meta: `Explore the public procurement profile of {name}. View awarded contract value, awarded lots, award history, procurement markets, CPV classifications, and recent public contracts.`
- Blocks: H1 name; Awarded lots; Award tenders; Company details (identifiers, countries, cities, emails, CPV codes); About this contractor; FAQ (generic); Understanding this contractor profile.
- No JSON-LD at all.

### country — `/{locale}/countries/{slug}` (slug: `germany`, `france`, ...)
- Title: `Public tenders in {country} | Tenderwize` (localized: de `Öffentliche Ausschreibungen — {country}`, etc.). Meta: `Find public procurement opportunities, government contracts and TED tenders in {country}.`
- Blocks: H1; Active tenders (up to 20); Recently closed tenders (10); FAQ. JSON-LD BreadcrumbList, ItemList, FAQPage (in server HTML).
- Indexable en/de/fr/pl with native copy.

### industry — `/{locale}/industries/{slug}` (CPV-based industry, e.g. `construction`, `software-development`)
- Title: `{industry name} | Tenderwize` (e.g. "Construction | Tenderwize"); H1 = industry name only. Meta from curated per-locale description.
- Blocks: H1; Active tenders (20); Recently closed tenders (10); FAQ. JSON-LD BreadcrumbList, ItemList, FAQPage.
- Indexed only if curated/featured, CPV level 2-4 or has tenders, and has any activity in 12 months. Indexable en/de/fr/pl.

### country_industry — `/{locale}/{countrySlug}/{industrySlug}` (e.g. `/en/germany/construction`)
- Main long-tail landing ("{industry} tenders {country}").
- Title: `{Industry} Tenders in {Country} | Tenderwize` (de `{Industry}-Ausschreibungen in {Country}`, fr `Appels d'offres {industry} en {country}`, pl `Przetargi na {industry} w {country}`). Meta: `Find {industry} tenders in {country}. Browse active public procurement opportunities, CPV codes, deadlines and AI tender analysis with Tenderwize.`
- Blocks: H1; Market overview; Active tenders; Recently closed tenders; Awarded contracts; Typical buyers; Contract values (median etc.); Popular industries in {country} (internal links); FAQ. JSON-LD BreadcrumbList, ItemList, FAQPage.
- Indexable en/de/fr/pl; noindex when no activity in 12 months.

### Hubs and lists
- `home` `/{locale}`: landing (hero with search, problem, AI demo, deep analysis, company matching, audience, sample opportunities, pricing, FAQ). JSON-LD WebSite+SearchAction, Organization, FAQPage. Title "Tenderwize — Find European Public Tenders with AI".
- `buyer_list` `/{locale}/buyers`, `contractor_list` `/{locale}/contractors`: directories with filters/sorting, native copy en/de/fr/pl.
- `country_list` `/{locale}/countries`, `industry_list` `/{locale}/industries`: indexes of the hubs (en only).
- `tool`: `/{locale}/tender-search` (public search, first results page SSR, `?q=`), `/{locale}/explore` (grid of links to countries and industries), `/{locale}/tenders` has no index page.
- `pricing` `/{locale}/pricing`: plans + FAQ, en only.
- `app`: logged-in and auth pages (dashboard, deep-analyses, opportunities, wishlist, settings, onboarding, checkout-redirect, login, register, `/auth/*`), disallowed in robots.txt. Never a target.

### guide (en only)
- `/guides` hub; articles: `/how-to-find-eu-tenders`, `/how-to-evaluate-a-tender-opportunity`, `/how-to-analyze-tender-documents-with-ai`, `/common-tender-requirements-in-europe`. Content in `src/content/geo/` (frontend). No other articles exist: a new guide is a content_gap task with a new URL.

### compare (en/de/fr/pl)
- `/compare` hub; `/compare/best-tender-alert-services-europe`: comparison of 8 tender alert services (Tenderwize, Jorpex, Stotles, Tenderlake, Tendium, Mercell, Tracker Intelligence, TED). Content in `src/content/compare/`.

### legal (never a target)
- `/privacy`, `/cookies` (en only indexable), `/terms` (307 to an external domain).

## Internal linking (what exists)
- Tender → buyer page, similar tenders. Award → buyer, contractor pages. Buyer → its tenders and awards. Contractor → its award tenders.
- Country_industry → "Popular industries in {country}". Explore → all countries and industries. Award directory → categories, countries, suppliers, buyers.
- Header: tender-search, buyers, contractors, countries, industries, guides, pricing, login/register. Footer (public pages): award-tenders, countries + 8 top countries (austria, belgium, france, germany, italy, netherlands, poland, spain), industries + 6 top industries (construction, engineering, healthcare, it-services, software-development, transport), guides, tender-search, legal. `/compare` is not linked from header or footer.

## Sitemaps (generated by the backend, `src/resources/tech/sitemap`)
- Index `/sitemaps/sitemap.xml`: static, tenders (open or deadline passed less than 60 days ago), award directory, industries, countries, country-industries. Generated for `en` only.
- `award-tenders-*.xml`, `buyers-*.xml` and `contractors-*.xml` are still generated but not listed in the index.
- Not in sitemaps today: `/pricing`, and the de/fr/pl versions of templates that are indexable in those locales (country, industry, country_industry, buyer/contractor lists, compare, award directory).

## Analytics (GA4)
Events sent by the frontend: `sign_up` (method email/google), `purchase` (Freemius, EUR), `cta_click` (param `cta_location` from `data-cta`: hero, header, header_mobile, cta_section, cta_section_demo, ai_demo, awards_*, compare_alerts_*), `search` (hero search), `deep_analysis_started`, `deep_analysis_generated`, `profile_completed`. Conversion = `sign_up` (primary) and `purchase`. Programmatic templates (tender, buyer, contractor, country, industry, country_industry) have no `data-cta` of their own: clicks there are tracked only via the header CTA and locked-analysis links are not tracked.

## Known issues (verified 2026-09-30, not yet fixed)
- JSON-LD on tender, award_tender, buyer, buyer_list, contractor_list is rendered with `next/script`, so the server HTML has no `application/ld+json` tag (only a serialized copy in the RSC payload). Contractor pages have no JSON-LD.
- Tender titles: `shortTitle` is cut to fit 70 chars mid-word ("Open-House-Arzneimittelrabattvertr Tender in Germany" on /de); a double space appears before "Tender" when the short title ends with a space ("Open-house drug rebate agreements  Tender in Germany").
- Industry pages: title and H1 are just the industry name ("Construction | Tenderwize"), without "tenders"/"public procurement".
- Country and industry hubs are thin in server HTML (H1 + two tender lists + FAQ, ~800-900 words mostly list items), unlike country_industry which has market overview, buyers, values and links.
- Buyer and contractor FAQ blocks are identical on every page (boilerplate).
- Sitemap gaps listed above.
