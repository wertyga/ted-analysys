import { TedNoticeType } from '@/resources/tenders/types';

//Для фильтра “тендеры, куда можно подаваться”:
export const TENDER_COMPETITION_NOTICE_TYPES: TedNoticeType[] = [
  TedNoticeType.CN_STANDARD,
  TedNoticeType.CN_SOCIAL,
  TedNoticeType.CN_DESG,
  TedNoticeType.PIN_CFC_STANDARD,
  TedNoticeType.PIN_CFC_SOCIAL,
  TedNoticeType.QU_SY,
];

// Для awards/history:
export const TED_AWARD_TENDER_NOTICE_TYPES: TedNoticeType[] = [
  TedNoticeType.CAN_STANDARD,
  TedNoticeType.CAN_SOCIAL,
  TedNoticeType.CAN_DESG,
  TedNoticeType.CAN_TRAN,
];

// Для early signals:
export const TED_PLANNED_TENDER_NOTICE_TYPES: TedNoticeType[] = [
  TedNoticeType.PLANNING,
  TedNoticeType.PIN_STANDARD,
  TedNoticeType.PIN_ONLY,
  TedNoticeType.PIN_CFC_STANDARD,
  TedNoticeType.PIN_CFC_SOCIAL,
];
