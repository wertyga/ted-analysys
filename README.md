## Main Flow

1. `ted-search` builds a TED expert query and fetches notices from TED.
2. `tenders` normalizes each raw TED notice into the local `Tender` schema and stores the original TED payload in `rawData`.
3. `cpv` resolves CPV codes to local `CpvCategory` records.
4. `tender-analysis` creates a general AI analysis for a tender.
5. `tender-deep-analysis` combines tender data, company profile, general analysis, and extracted document text to produce a company-specific bid/no-bid analysis.
6. `tender-wishlist` stores user-specific saved tenders.

`rawData` is internal fallback data only. It is saved in MongoDB but excluded from normal query selection and DTO output.

## Resources

### `auth`

Handles authentication and account lifecycle.

- Public auth endpoints: Google OAuth, email/password signin, signup, email confirmation, password reset, email change.
- Admin auth endpoint for admin signin.
- Creates temporary users until email confirmation.
- Stores password hashes, auth tokens, recovery tokens, and temp email state on `User`.
- Sends confirmation/recovery emails through `email`.

Key files:
- `auth.controller.ts`
- `auth.adm.controller.ts`
- `auth.service.ts`
- `auth.dto.ts`

### `user`

Manages user profiles and company data used by tender matching.

- Returns current user.
- Updates profile fields.
- Resolves `industries` and `mainServices` CPV code inputs into `CpvCategory` ObjectIds.
- Admin endpoint lists users.
- Company profile fields are later consumed by `tender-deep-analysis`.

Key files:
- `users.controller.ts`
- `users.adm.controller.ts`
- `users.service.ts`
- `user.schema.ts`
- `user.dto.ts`

### `email`

Thin email delivery resource.

- Wraps Nodemailer sending.
- Loads HTML email templates.
- Used mostly by `auth` for confirmation and recovery flows.

Key files:
- `email.service.ts`
- `email.utils.ts`
- `type.ts`

### `cpv`

Stores and serves CPV categories.

- `GET /cpv/search`: search CPV by code/name.
- `GET /cpv/cpv-categories`: resolve exact CPV codes.
- `GET /cpv/industries`: list higher-level industry categories.
- `POST /cpv/descendants`: return descendant CPV categories/codes for broad matching.
- `POST /cpv/update`: sync CPV categories from TED eForms codelist.

The CPV sync downloads the official codelist HTML, parses code/name pairs, calculates parent relationships, and upserts into `CpvCategory`.

Key files:
- `cpv.controller.ts`
- `cpv.service.ts`
- `schemas/cpv-category.schema.ts`

### `ted-search`

Builds TED Search API queries and fetches notices.

- `GET /ted/countries`: frontend country filter list.
- `POST /ted/search`: searches active TED competition notices using structured filters.
- Builds TED expert query syntax from text, title, description, CPV, countries, notice types, publication date, deadline range, and contract nature.
- Uses `resolveDeadlineRange` so `any open` means submission deadline from today onward.
- Can also search local tenders for stored results and analysis-score filtering.

Important behavior:
- Default notice types for frontend search are `TENDER_COMPETITION_NOTICE_TYPES`.
- Default TED fields include core notice data, lots, CPV, buyer data, dates, links, document URLs, submission URLs, criteria, and eForms flags.
- Debug request logs are dev-only.

Key files:
- `ted-search.controller.ts`
- `ted-search.service.ts`
- `ted-builders/`
- `utils/ted-search.utils.ts`
- `utils/niticies.ts`

### `tenders`

Central tender persistence and normalization resource.

- `GET /tenders/:id`: get tender by local id, TED publication number, or source notice id.
- `POST /tenders/adm/gather-active`: admin import of active TED notices.
- `POST /tenders/adm/migrate-date-fields`: admin date-field migration helper.
- Normalizes raw TED notices into local `Tender` fields.
- Saves raw TED notice payload in `rawData` as internal fallback data.
- Resolves CPV references through `TenderNormalizerService`.
- Fetches TED notices by publication number when local tender is missing.
- Maps Mongo documents to detail/list DTOs while excluding heavy/internal fields from list output.
- Runs a cron job to import new competition notices published in the last two days with deadlines from today onward.

Cron behavior:
- Service: `TendersCronService`
- Schedule: daily at `01:00` Europe/Warsaw
- Query: `TENDER_COMPETITION_NOTICE_TYPES`, publication date from today minus two days to today, deadline from today onward
- Saves only new tenders; existing publication numbers are skipped

Key files:
- `tenders.controller.ts`
- `tenders.adm.controller.ts`
- `tenders.service.ts`
- `tenders-cron.service.ts`
- `tender-normalizer.service.ts`
- `tender-document-text-extractor.service.ts`
- `schemas/tender.schema.ts`

### `tender-analysis`

General tender AI analysis.

- `GET /general-analysis/tenders/:tenderId`: returns finished general analysis for a tender.
- Builds source hashes for caching/staleness checks.
- Runs general tender analysis through the configured LLM service.
- Stores normalized analysis result and scoring metadata in `TenderGeneralAnalysis`.
- Provides DTO mapping for list/detail use.

This analysis is tender-focused and not company-specific. It can be reused by `tender-deep-analysis`.

Key files:
- `tender-general-analysis.controller.ts`
- `tender-general-analysis.service.ts`
- `tender-analysis.service.ts`
- `schemas/tender-general-analysis.schema.ts`

### `tender-deep-analysis`

Company-specific tender fit and bid/no-bid analysis.

- `POST /tenders/:tenderId/deep-analysis`: starts company-fit analysis for the current company.
- `GET /tenders/:tenderId/deep-analysis`: returns latest completed deep analysis.
- Combines:
  - normalized tender data
  - finished general tender analysis
  - user/company profile
  - derived metadata
  - extracted procurement document text snippets
- Downloads and extracts text from selected TED document links (`xml`, `pdf`, `pdfs`).
- Excludes TED HTML notice links from deep document extraction because they duplicate notice content.
- Produces fit scores, blocker/risk analysis, readiness scores, documentation completeness, clarification questions, and final recommendation.

Key files:
- `tender-deep-analysis.controller.ts`
- `tender-deep-analysis.service.ts`
- `tender-deep-analysis.builder.ts`
- `tender-deep-document-input.service.ts`
- `schemas/tender-deep-analysis.schema.ts`

### `tender-wishlist`

User-specific saved tender list.

- `GET /wishlist`: paginated saved tenders for current user.
- `GET /wishlist/:tenderId`: saved status for one tender.
- `POST /wishlist/:tenderId`: save tender.
- `DELETE /wishlist/:tenderId`: remove tender.
- Fetches and saves tender from TED if the user saves a tender not already present locally.
- Uses a unique user+tender constraint and treats duplicate saves as idempotent.

Key files:
- `tender-wishlist.controller.ts`
- `tender-wishlist.service.ts`
- `schemas/tender-wishlist.schema.ts`

## Internal Utilities

Shared helpers live in `src/utils`.

- `env.ts`: `isDev` flag for dev-only info/debug logs.
- `hash.ts`: hashing/token helpers.
- `mongo.ts`: Mongo helpers.
- `checking.ts`, `string.ts`, `url.ts`: validation and parsing utilities.
- `logger.ts`: shared logging utility.

## Logging Policy

- Dev-only: startup info, DB connection info, request/debug payloads, completed analysis/debug messages.
- Production: warnings and errors remain enabled.
- Avoid logging raw TED payloads, buffers, extracted document text, HTML/XML/PDF contents, or large Mongoose documents.

## Model Configuration

- `LLM_PROVIDER`: `deepseek` by default, or `openai`.
- `LLM_API_KEY`: shared API key override. Otherwise use `DEEPSEEK_API_KEY` or `OPENAI_API_KEY`.
- `LLM_BASE_URL`: optional shared base URL override. DeepSeek defaults to `https://api.deepseek.com`; OpenAI uses the SDK default.
- `LLM_GENERAL_ANALYSIS_MODEL` and `LLM_DEEP_ANALYSIS_MODEL`: required model names.

## Data Notes

- `Tender.rawData` stores the full raw TED notice payload and is marked `select: false` in the Mongoose schema.
- `rawData` must not be returned by public list/detail DTOs.
- TED HTML notice links are treated as duplicate notice content and are not used for deep document extraction.
- Procurement document frontend routes such as SPA `#/...` URLs are not real downloadable documents; downloader logic should only receive direct document/API URLs.
