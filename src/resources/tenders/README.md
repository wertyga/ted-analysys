# Tender Search BFF

Product-facing endpoints return stable DTOs for the frontend. Raw TED endpoints remain available under `/ted/*`.

Swagger UI is available at:

```bash
http://localhost:3000/docs
```

## CPV

Search CPV codes:

```bash
curl "http://localhost:3000/cpv/search?q=software&limit=10"
```

Popular top-level CPV categories:

```bash
curl "http://localhost:3000/cpv/popular"
```

Refresh CPV categories from the official TED codelist:

```bash
curl -X POST "http://localhost:3000/cpv/update"
```

## Tenders

Search tenders with filters:

```bash
curl -X POST "http://localhost:3000/tenders/search" \
  -H "Content-Type: application/json" \
  -d '{
    "cpvCodes": ["72000000"],
    "countries": ["POL"],
    "keyword": "software",
    "scope": "ACTIVE",
    "page": 1,
    "limit": 20
  }'
```

Search by CPV and include children:

```bash
curl -X POST "http://localhost:3000/tenders/search-by-cpv" \
  -H "Content-Type: application/json" \
  -d '{
    "cpvCodes": ["72000000"],
    "matchMode": "TREE",
    "scope": "ACTIVE",
    "page": 1,
    "limit": 20
  }'
```

Load a normalized tender from the local database:

```bash
curl "http://localhost:3000/tenders/123456-2026"
```

Load a tender by local TED-style id. If it is missing locally, the backend tries a targeted TED lookup by publication number:

```bash
curl "http://localhost:3000/tenders/ted-123456-2026"
```

Load a tender by TED publication number with the same DB-first, TED-fallback behavior:

```bash
curl "http://localhost:3000/tenders/123456-2026"
```

Include the raw TED notice for debugging:

```bash
curl "http://localhost:3000/tenders/123456-2026?includeRaw=true"
```

Raw TED debugging endpoints:

```bash
curl -X POST "http://localhost:3000/ted/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"classification-cpv IN (72000000)","scope":"ACTIVE","limit":10,"page":1}'

curl "http://localhost:3000/ted/active-it?limit=10"
curl "http://localhost:3000/ted/cpv?codes=72000000&limit=10&page=1&scope=ACTIVE"
```
