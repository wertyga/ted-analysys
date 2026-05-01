# TED Search Module

Raw TED Search API v3 integration for published procurement notices.

## POST search

```bash
curl -X POST http://localhost:3000/ted/search \
  -H "Content-Type: application/json" \
  -d '{"query":"(classification-cpv IN (72000000))","scope":"ACTIVE","limit":10,"page":1,"paginationMode":"PAGE_NUMBER","onlyLatestVersions":true}'
```

## Active IT tenders

```http
GET /ted/active-it?limit=10
```

## CPV search

```http
GET /ted/cpv?codes=72000000,48000000&limit=20&page=1&scope=ACTIVE
```

Country filtering is intentionally not enabled in production request builders
until the exact TED expert-search country field is verified in TED
Swagger/Expert Search.
