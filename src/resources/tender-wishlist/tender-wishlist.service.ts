import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TenderDocument,
  TenderWithWishlist,
} from '@/resources/tenders/schemas';
import { isDuplicateKeyError } from '@/utils';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderListDto } from '@/resources/tenders/dto/tender.dto';
import { TenderWishlistItemModel } from './schemas';
import { UserDocument } from '@/resources/user/user.types';

@Injectable()
export class TenderWishlistService {
  constructor(private readonly tendersService: TendersService) {}

  async addTender(user: UserDocument, tenderId: string) {
    const tender = await this.findOrFetchTender(tenderId);

    try {
      await TenderWishlistItemModel.create({
        user: user._id,
        tender: tender._id,
        tenderId: tender.id,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    return this.getTenderStatus(user, tender.id);
  }

  private async findOrFetchTender(tenderId: string): Promise<TenderDocument> {
    const localTender = await this.tendersService.findLocalTender(tenderId);

    if (localTender) {
      return localTender;
    }

    const tedNotice =
      await this.tendersService.fetchTedNoticeByPublicationNumber(tenderId);

    if (!tedNotice) {
      throw new NotFoundException(`Tender ${tenderId} not found`);
    }

    const tender = await this.tendersService.upsertTender(tedNotice);

    if (!tender) {
      throw new NotFoundException(`Tender ${tenderId} not found`);
    }

    return tender;
  }

  async removeTender(user: UserDocument, tenderId: string) {
    await TenderWishlistItemModel.deleteOne({
      user: user._id,
      tenderId,
    }).exec();

    return { tenderId, isInWishlist: false };
  }

  async getTenderStatus(user: UserDocument, tenderId: string) {
    const item = await TenderWishlistItemModel.findOne({
      user: user._id,
      tenderId,
    })
      .select('_id')
      .lean()
      .exec();

    return {
      tenderId,
      isInWishlist: item !== null,
    };
  }

  async listUserTenders(user: UserDocument, page = 1, limit = 20) {
    const userId = user._id;
    const normalizedPage = Math.max(1, page);
    const normalizedLimit = Math.min(Math.max(1, limit), 100);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [items, total] = await Promise.all([
      TenderWishlistItemModel.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(normalizedLimit)
        .select('tender')
        .lean()
        .exec(),
      TenderWishlistItemModel.countDocuments({ user: userId }).exec(),
    ]);

    const tenderIds = items.map((item) => item.tender);

    const tenders =
      await this.tendersService.findMultipleLocalTendersWithBaseAnalysis({
        _id: { $in: tenderIds },
      });
    const tendersById = new Map(
      tenders.map((tender) => [tender._id.toString(), tender]),
    );

    return {
      tenders: tenderIds
        .map((tenderId) => tendersById.get(tenderId.toString()))
        .filter(Boolean),
      total,
    };
  }

  async countUserTenders(user: UserDocument) {
    return TenderWishlistItemModel.countDocuments({ user: user._id }).exec();
  }
}
