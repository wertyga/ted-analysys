import { TedNoticeType } from '@/resources/tenders/types';

//Для фильтра “тендеры, куда можно подаваться”:
export const TENDER_COMPETITION_NOTICE_TYPES: TedNoticeType[] = [
  TedNoticeType.CN_STANDARD,
  TedNoticeType.CN_SOCIAL,
  TedNoticeType.CN_DESG,
  TedNoticeType.PIN_CFC_STANDARD,
  TedNoticeType.PIN_CFC_SOCIAL,
  TedNoticeType.QU_SY,
  TedNoticeType.SUBCO,
];

// Для awards/history:
export const TENDER_RESULT_NOTICE_TYPES: TedNoticeType[] = [
  TedNoticeType.CAN_STANDARD,
  TedNoticeType.CAN_SOCIAL,
  TedNoticeType.CAN_DESG,
  TedNoticeType.CAN_TRAN,
];

export const TENDER_HISTORY_NOTICE_TYPES: TedNoticeType[] = [
  TedNoticeType.CAN_STANDARD,
  TedNoticeType.CAN_SOCIAL,
  TedNoticeType.CAN_DESG,
  TedNoticeType.CAN_TRAN,
  TedNoticeType.CAN_MODIF,
  TedNoticeType.VEAT,
  TedNoticeType.COMPL,
];

// Для early signals:
export const TENDER_PLANNING_NOTICE_TYPES: TedNoticeType[] = [
  TedNoticeType.PIN_STANDARD,
  TedNoticeType.PIN_ONLY,
  TedNoticeType.QN_STANDARD,
  TedNoticeType.QN_SOCIAL,
];
