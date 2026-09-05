# Tenderwize Features

The fixed list of real Tenderwize capabilities that a post is allowed to reference as the "Tenderwize capability" step of the value-first formula (see `X_POSTS_GUIDELINES.md` section 3).

Rules:

- Pick from this list only. Never invent, guess, or embellish a feature/capability that isn't listed here.
- Describe what it does in plain language for the reader — don't just drop the feature name.
- If nothing on this list connects naturally to the post's value/fact, don't force one in — skip straight to the CTA/link (see guidelines section 9).
- Some features below are gated on paid plans (see `TARIFFS.md`) — it's fine to describe what the platform can do without stating pricing/plan details, unless the post is explicitly about pricing.
- This file describes backend capabilities as implemented in this repo. If a feature described here has since changed or been removed, don't cite it — flag the mismatch instead of guessing.

## Search & discovery

- **Cross-country tender search** — search live TED tenders across all EU countries from one place, instead of checking each country's own portal separately.
- **CPV/category filters** — filter by CPV code or category, not just free-text keywords, so relevant tenders don't get missed by wording differences.
- **Wishlist** — save specific tenders to track ahead of their submission deadline instead of re-finding them later.

## AI analysis

- **Tender analysis** — an instant AI-generated summary of any tender notice (subject, requirements, key dates) without reading the full notice manually.
- **Deep company-fit analysis** — AI scores a specific tender against a company's own profile and documents, producing a win-likelihood/recommendation and a requirements checklist — not just a generic summary.
- **Company profile documents** — upload company documents (certificates, past project references, capability statements); the AI reads them to understand what the company can actually deliver, which feeds matching and deep analysis.

## Matching & alerts

- **Automated tender matching** — a background process scores every new tender against a company's profile automatically, instead of the company running manual searches.
- **Match alerts (instant/daily/weekly)** — get emailed as soon as a matching tender appears, or as a daily/weekly digest, rather than checking the platform manually.

## Buyer & supplier intelligence

- **Buyer Intelligence** — an AI-built profile of any contracting authority: spend history, most-purchased CPV categories, most-awarded suppliers, repeat-supplier and local-supplier signals, and activity level — useful for gauging whether a buyer is worth bidding to.
- **Buyer & supplier directories** — browse/search buyers and past contract winners with aggregate stats (tenders published, total awarded value, win counts) instead of piecing that history together notice by notice.

## Data normalization

- **EUR-normalized values** — all tender/award amounts are converted to EUR, so values from different countries and currencies are directly comparable.
