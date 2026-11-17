import {
  isNationalTenderId,
  NationalTendersReadService,
} from '@/resources/national-tenders/core/national-tenders-read.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenderDocument } from '@/resources/tenders/schemas';
import { getPaginationMeta, isDuplicateKeyError } from '@/utils';
import { TendersService } from '@/resources/tenders/tenders.service';
import { TenderWishlistItemModel } from './schemas';
import { UserDocument } from '@/resources/user/user.types';
import { TariffService } from '@/resources/tariff';

@Injectable()
export class TenderWishlistService {
  constructor(
    private readonly tendersService: TendersService,
    private readonly tariffService: TariffService,
    private readonly nationalTendersReadService: NationalTendersReadService,
  ) {}

  async addTender(user: UserDocument, tenderId: string) {
    await this.canAddTenderGuard(user, tenderId);

    const tender =
      await this.tendersService.findLocalOrNationalTender(tenderId);

    if (!tender) {
      throw new NotFoundException(`Tender ${tenderId} not found`);
    }

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
    const pagination = getPaginationMeta({ page, limit });

    const [items, total] = await Promise.all([
      TenderWishlistItemModel.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .select('tender tenderId')
        .lean()
        .exec(),
      TenderWishlistItemModel.countDocuments({ user: userId }).exec(),
    ]);

    const tenderIds = items.map((item) => item.tender);
    const nationalIds = items
      .filter((item) => isNationalTenderId(item.tenderId))
      .map((item) => item.tender);

    const [tenders, nationalTenders] = await Promise.all([
      this.tendersService.findMultipleLocalTendersWithBaseAnalysis({
        _id: { $in: tenderIds },
      }),
      this.nationalTendersReadService.findManyByObjectIds(nationalIds),
    ]);
    const tendersById = new Map<string, unknown>([
      ...tenders.map((tender) => [tender._id.toString(), tender] as const),
      ...nationalTenders.map(
        (tender) => [tender._id.toString(), tender] as const,
      ),
    ]);

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

  private async canAddTenderGuard(
    user: UserDocument,
    tenderId: string,
  ): Promise<void> {
    const tariff = await this.tariffService.getUserTariff(user);
    const rule = tariff.rules.wishlist;

    if (!rule.enabled) {
      throw new ForbiddenException('Wishlist is not available for this tariff');
    }

    if (!rule.maxItems) {
      return;
    }

    const existingItem = await TenderWishlistItemModel.findOne({
      user: user._id,
      tenderId,
    })
      .select('_id')
      .lean()
      .exec();

    if (existingItem) {
      return;
    }

    const currentCount = await this.countUserTenders(user);

    if (currentCount >= rule.maxItems) {
      throw new ConflictException(
        `Wishlist limit reached for this tariff: ${rule.maxItems}`,
      );
    }
  }
}
