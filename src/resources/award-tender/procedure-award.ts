import { Types } from 'mongoose';
import { ContractorModel } from '@/resources/contractor/schemas';
import {
  NationalAwardLotStatus,
  NationalTenderSource,
} from '@/resources/national-tenders/core/national-tender.types';
import {
  NationalAwardTender,
  NationalAwardTenderModel,
} from '@/resources/national-tenders/core/schemas/national-award-tender.schema';
import { AwardTender, AwardTenderModel } from './schemas';

type Money = { amount: number | null; currency: string | null };

/** Result of one part (lot) of the procedure, see FRONTEND_CONTRACT.md §8. */
export interface ProcedureAwardLotDto {
  identifier: string;
  title: string | null;
  /** `null` when the source does not say (TED lot without a winner). */
  status: NationalAwardLotStatus | null;
  cancellationReason: string | null;
  winner: { _id: string; name: string | null } | null;
  isJointVenture: boolean;
  awardValue: Money | null;
  awardValueEur: number | null;
  offersCount: number | null;
  contractConclusionDate: Date | null;
  /** Result notice this lot comes from (`/award-tenders/<awardId>`). */
  awardId: string;
}

/** `award` field of `GET /tenders/:id`: all result notices of the procedure. */
export interface ProcedureAwardDto {
  /** Latest result notice of the procedure. */
  id: string;
  /** All result notices of the procedure, newest first. */
  awardIds: string[];
  publicationDate: Date | null;
  awardDate: Date | null;
  /** Sum of `lots[].awardValueEur`; `null` when no lot has a value. */
  awardValueEur: number | null;
  lots: ProcedureAwardLotDto[];
}

export type ProcedureAwardKey =
  | { source: 'TED'; procedureId?: string | null }
  | { source: NationalTenderSource; procedureId?: string | null };

/** Result notices beyond this are ignored (frameworks with many call-offs). */
const MAX_RESULT_NOTICES = 50;

const RESULT_FIELDS =
  'id publicationDate awardDate lots.identifier lots.title lots.status ' +
  'lots.cancellationReason lots.winner lots.isJointVenture lots.awardValue ' +
  'lots.awardValueEur lots.offersCount lots.contractConclusionDate';

type ResultNotice = Pick<
  AwardTender,
  'id' | 'publicationDate' | 'awardDate'
> & {
  lots: Array<{
    identifier?: string;
    title?: string;
    status?: NationalAwardLotStatus;
    cancellationReason?: string;
    winner?: Types.ObjectId | string;
    isJointVenture?: boolean;
    awardValue?: Money;
    awardValueEur?: number | null;
    offersCount?: number;
    contractConclusionDate?: Date;
  }>;
};

/**
 * Result of the procedure the tender belongs to, or `null` when no result
 * notice is stored. TED links by `procedureId` (filled for notices collected
 * after 2026-11-21), national sources by `sourceProcedureId`.
 */
export async function findProcedureAward(
  key: ProcedureAwardKey,
): Promise<ProcedureAwardDto | null> {
  if (!key.procedureId) {
    return null;
  }

  const notices: ResultNotice[] =
    key.source === 'TED'
      ? await AwardTenderModel.find({ procedureId: key.procedureId })
          .select(RESULT_FIELDS)
          .sort({ publicationDate: -1, _id: -1 })
          .limit(MAX_RESULT_NOTICES)
          .lean<ResultNotice[]>()
      : await NationalAwardTenderModel.find({
          source: key.source,
          sourceProcedureId: key.procedureId,
        })
          .select(RESULT_FIELDS)
          .sort({ publicationDate: -1, _id: -1 })
          .limit(MAX_RESULT_NOTICES)
          .lean<(NationalAwardTender & ResultNotice)[]>();

  return buildProcedureAward(notices, await loadWinnerNames(notices));
}

async function loadWinnerNames(
  notices: ResultNotice[],
): Promise<Map<string, string | null>> {
  const ids = [
    ...new Set(
      notices.flatMap((notice) =>
        notice.lots.flatMap((lot) => (lot.winner ? [String(lot.winner)] : [])),
      ),
    ),
  ];

  if (!ids.length) {
    return new Map();
  }

  const contractors = await ContractorModel.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  } as never)
    .select('name')
    .lean<{ _id: Types.ObjectId; name?: string }[]>();

  return new Map(contractors.map((c) => [String(c._id), c.name ?? null]));
}

/**
 * Merges result notices (newest first) into one procedure result: each lot is
 * taken from the newest notice that reports it.
 */
export function buildProcedureAward(
  notices: ResultNotice[],
  winnerNames: Map<string, string | null>,
): ProcedureAwardDto | null {
  if (!notices.length) {
    return null;
  }

  const lots = new Map<string, ProcedureAwardLotDto>();

  for (const notice of notices) {
    for (const lot of notice.lots ?? []) {
      const identifier = lot.identifier ?? 'LOT-0001';

      if (lots.has(identifier)) {
        continue;
      }

      const winnerId = lot.winner ? String(lot.winner) : null;

      lots.set(identifier, {
        identifier,
        title: lot.title ?? null,
        status: lot.status ?? (winnerId ? 'awarded' : null),
        cancellationReason: lot.cancellationReason ?? null,
        winner: winnerId
          ? { _id: winnerId, name: winnerNames.get(winnerId) ?? null }
          : null,
        isJointVenture: lot.isJointVenture ?? false,
        awardValue: lot.awardValue?.amount != null ? lot.awardValue : null,
        awardValueEur: lot.awardValueEur ?? null,
        offersCount: lot.offersCount ?? null,
        contractConclusionDate: lot.contractConclusionDate ?? null,
        awardId: notice.id,
      });
    }
  }

  const mergedLots = [...lots.values()].sort((a, b) =>
    a.identifier.localeCompare(b.identifier, 'en', { numeric: true }),
  );
  const lotValues = mergedLots.flatMap((lot) =>
    typeof lot.awardValueEur === 'number' && Number.isFinite(lot.awardValueEur)
      ? [lot.awardValueEur]
      : [],
  );
  const awardDates = notices
    .map((notice) => notice.awardDate)
    .filter((date): date is Date => !!date);

  return {
    id: notices[0].id,
    awardIds: notices.map((notice) => notice.id),
    publicationDate: notices[0].publicationDate ?? null,
    awardDate: awardDates.length
      ? new Date(Math.max(...awardDates.map((date) => +new Date(date))))
      : null,
    awardValueEur: lotValues.length
      ? lotValues.reduce((sum, value) => sum + value, 0)
      : null,
    lots: mergedLots,
  };
}
