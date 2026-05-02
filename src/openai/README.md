# OpenAI Tender Analysis

Required environment variables:

```bash
OPENAI_API_KEY=
OPENAI_GENERAL_ANALYSIS_MODEL=gpt-4.1-mini
OPENAI_CLIENT_FIT_MODEL=gpt-4.1
```

Install SDK:

```bash
npm install openai
```

Future Prisma persistence model, if the project switches/adds Prisma for tender AI analysis:

```prisma
model TenderAiAnalysis {
  id             String   @id @default(cuid())
  tenderNoticeId String   @unique

  status         String   @default("PENDING") // PENDING | PROCESSING | DONE | FAILED
  resultJson     Json?
  summary        String?
  complexityScore Int?
  opportunityScore Int?
  generalGoNoGo  String?

  sourceHash     String?
  promptVersion  String?
  model          String?
  errorMessage   String?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  tenderNotice   TenderNotice @relation(fields: [tenderNoticeId], references: [id], onDelete: Cascade)
}
```
