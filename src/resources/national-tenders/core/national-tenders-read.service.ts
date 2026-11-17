import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { TenderDocument } from '@/resources/tenders/schemas';
import {
  NationalTenderDetailDto,
  serializeNationalTenderDetail,
  toAnalysisTender,
} from './national-tender.serializer';
import {
  NationalTender,
  NationalTenderModel,
} from './schemas/national-tender.schema';

export { isNationalTenderId } from './national-tender.serializer';
export type { NationalTenderDetailDto } from './national-tender.serializer';

@Injectable()
export class NationalTendersReadService {
  async findById(id: string): Promise<NationalTender | null> {
    return NationalTenderModel.findOne({ id }).lean<NationalTender>().exec();
  }

  async findManyByObjectIds(ids: Types.ObjectId[]): Promise<NationalTender[]> {
    if (!ids.length) {
      return [];
    }

    return NationalTenderModel.find({ _id: { $in: ids } })
      .lean<NationalTender[]>()
      .exec();
  }

  /** National tender adapted for analyses (with the source notice text). */
  async findAnalysisTender(id: string): Promise<TenderDocument | null> {
    const tender = await NationalTenderModel.findOne({ id })
      .select('+rawData')
      .lean<NationalTender>()
      .exec();

    return tender ? toAnalysisTender(tender) : null;
  }

  serializeDetail(tender: NationalTender): NationalTenderDetailDto {
    return serializeNationalTenderDetail(tender);
  }

  toAnalysisTender(tender: NationalTender): TenderDocument {
    return toAnalysisTender(tender);
  }
}
