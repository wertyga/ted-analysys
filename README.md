For FE:
 - Search tenders filter deadline:
   Deadline:
 - Any open
 - Next 7 days
 - Next 14 days
 - Next 30 days
 - Custom range

??
Типы тендеров, одновременный\длительный и т.п. отмечать на фронте их badge
isLongRunningOpportunity?: boolean;
opportunityKind?: 'STANDARD_TENDER' | 'DPS' | 'QUALIFICATION_SYSTEM' | 'FRAMEWORK' | 'UNKNOWN';
function detectOpportunityKind(title?: string, noticeType?: string): string {
const text = `${title ?? ''} ${noticeType ?? ''}`.toLowerCase();

if (
text.includes('dynamic purchasing system') ||
text.includes('dynamic procurement system') ||
text.includes('dps') ||
text.includes('dynaaminen hankintajärjestelmä')
) {
return 'DPS';
}

if (
text.includes('qualification system') ||
noticeType === 'qu-sy'
) {
return 'QUALIFICATION_SYSTEM';
}

return 'STANDARD_TENDER';
}


