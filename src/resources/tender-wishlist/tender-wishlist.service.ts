import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import mongoose from 'mongoose';
import {
  TenderDocument,
  TenderWithWishlist,
} from '@/resources/tenders/schemas';
import { isDuplicateKeyError } from '@/utils';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderListDto } from '@/resources/tenders/dto/tender.dto';
import { TenderWishlistItemModel } from './schemas';
import { UserDocument } from '@/resources/user/user.types';
import { CPV_CODES_LIST_FIELDS } from '@/resources/cpv/cpv.service';
import { tenderCpvPopulateFields } from '@/resources/tenders/utils/tender.utils';

@Injectable()
export class TenderWishlistService {
  constructor(private readonly tendersService: TendersService) {}

  async addTender(user: unknown, tenderId: string) {
    const userId = this.getUserObjectId(user);
    const tender = await this.findOrFetchTender(tenderId);

    try {
      await TenderWishlistItemModel.create({
        user: userId,
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

  async removeTender(user: unknown, tenderId: string) {
    const userId = this.getUserObjectId(user);

    await TenderWishlistItemModel.deleteOne({
      user: userId,
      tenderId,
    }).exec();

    return { tenderId, isInWishlist: false };
  }

  async getTenderStatus(user: unknown, tenderId: string) {
    const userId = this.getUserObjectId(user);
    const item = await TenderWishlistItemModel.findOne({
      user: userId,
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

  async getPopulatedTendersByWishlists(
    tenders: (TenderDocument | TenderListDto)[],
    userId: string,
  ): Promise<TenderWithWishlist[]> {
    const ids = tenders.map((t) => t._id.toString());

    const wishTendersIds = await TenderWishlistItemModel.find({
      user: userId,
      tender: { $in: ids },
    })
      .lean()
      .then((items) => items.map((t) => t.tender.toString()));

    return tenders.map((tender) => {
      return {
        ...('toObject' in tender ? tender.toObject() : tender),
        isInWishlist: wishTendersIds.includes(tender._id.toString()),
      };
    });
  }

  async listUserTenders(user: UserDocument, page = 1, limit = 20) {
    const userId = this.getUserObjectId(user);
    const normalizedPage = Math.max(1, page);
    const normalizedLimit = Math.min(Math.max(1, limit), 100);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [items, total] = await Promise.all([
      TenderWishlistItemModel.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(normalizedLimit)
        .populate({
          path: 'tender',
          populate: tenderCpvPopulateFields,
        })
        .lean()
        .exec(),
      TenderWishlistItemModel.countDocuments({ user: userId }).exec(),
    ]);

    return {
      tenders: items.map((item) => item.tender).filter(Boolean),
      total,
    };
  }

  private getUserObjectId(user: unknown): mongoose.Types.ObjectId {
    const rawUserId = this.getRawUserId(user);

    if (!rawUserId || !mongoose.Types.ObjectId.isValid(rawUserId)) {
      throw new UnauthorizedException('User is required');
    }

    return new mongoose.Types.ObjectId(rawUserId);
  }

  private getRawUserId(user: unknown): string | undefined {
    if (!user || typeof user !== 'object') {
      return undefined;
    }

    const record = user as Record<string, unknown>;
    const id = record._id ?? record.id;

    if (typeof id === 'string') {
      return id;
    }

    if (id instanceof mongoose.Types.ObjectId) {
      return id.toString();
    }

    return undefined;
  }
}
