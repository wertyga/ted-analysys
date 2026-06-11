import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentEntity, PurchaseInfo } from '@freemius/sdk';
import { freemiusClient } from '@/lib/freemius/freemius';
import { UserModel } from '@/resources/user/user.schema';
import { UserDocument } from '@/resources/user/user.types';
import { PaymentEntitlementModel } from './schemas/payment-entitlement.schema';
import { resolveTariffTypeByFreemiusPlanName } from '@/resources/tariff/freemius-tariff';
import { TariffType } from '@/resources/tariff/tariff.types';
import type { CouponDocument } from '@/resources/coupon/schemas';
import {
  CreatePaymentCheckoutDto,
  GetPaymentListDto,
} from './dto/payments.dto';

type ActivePaymentEntitlement = Record<string, any> & {
  _id: unknown;
  licenseId: string;
  planId: string;
  tariffType?: TariffType | null;
  isCanceled?: boolean;
  expiration?: Date | null;
};

type FreemiusCheckoutData = CreatePaymentCheckoutDto & {
  licenseId?: string;
};

@Injectable()
export class PaymentsService {
  async createFreeCouponEntitlement(
    user: UserDocument,
    coupon: CouponDocument,
  ) {
    const now = new Date();
    const registrationDate = user.createdAt ? new Date(user.createdAt) : now;
    const expiration = new Date(registrationDate);
    expiration.setDate(expiration.getDate() + 7);

    const licenseId = this.buildFreeCouponLicenseId(coupon, user);

    return PaymentEntitlementModel.findOneAndUpdate(
      {
        licenseId,
      },
      {
        $set: {
          user: user._id,
          licenseId,
          externalUserId: '10359035',
          planId: '49360',
          priceId: '64324',
          subscriptionId: '791446',
          tariffType: TariffType.pro,
          type: 'subscription',
          expiration,
          isCanceled: false,
        },
      },
      {
        returnDocument: 'after',
        upsert: true,
      },
    );
  }

  async createCheckout(user: UserDocument, data: CreatePaymentCheckoutDto) {
    const activeEntitlement = await this.getUserEntitlement(user);
    const targetTariffType = await this.getTariffTypeByPlanId(data.planId);

    const areTariffTypesTheSame =
      activeEntitlement?.tariffType === targetTariffType;

    if (!activeEntitlement) {
      return this.createNewSubscription(user, data);
    }

    if (!activeEntitlement.isCanceled && areTariffTypesTheSame) {
      throw new ConflictException('Tariff is active');
    }

    if (!activeEntitlement.isCanceled) {
      return this.upgradeSubscription(user, data);
    }

    if (activeEntitlement.isCanceled && !areTariffTypesTheSame) {
      // ...
    }
  }

  async createNewSubscription(
    user: UserDocument,
    data: CreatePaymentCheckoutDto,
  ) {
    return this.createFreemiusCheckout(user, data);
  }

  private async createFreemiusCheckout(
    user: UserDocument,
    data: FreemiusCheckoutData,
  ) {
    return freemiusClient.createCheckout({
      user: {
        email: user.email,
        name: user.companyName,
      },
      planId: data.planId,
      licenseId: data.licenseId,
      coupon: data.coupon,
      billingCycle: data.billingCycle,
    });
  }

  async getCheckout(licenseId: string) {
    return this.syncEntitlementFromLicense(licenseId);
  }

  async getUserEntitlement(
    user: UserDocument,
  ): Promise<ActivePaymentEntitlement | undefined> {
    const activeEntitlements = await PaymentEntitlementModel.find({
      user: user._id,
      type: 'subscription',
      $or: [{ expiration: { $gt: new Date() } }],
    }).sort({ createdAt: -1 });

    return activeEntitlements?.[0];
  }

  async getPricingList() {
    return freemiusClient.getPricingList();
  }

  async getPayments(
    user: UserDocument,
    query: GetPaymentListDto,
  ): Promise<PaymentEntity[]> {
    const pagination = {
      count: query.count,
      offset: query.offset,
    };

    return freemiusClient.searchPaymentsByEmail(user.email, pagination);
  }

  async renewCanceledSubscription(user: UserDocument) {
    const activeEntitlement = await this.getUserEntitlement(user);

    if (!activeEntitlement) {
      throw new NotFoundException('Subscription not found.');
    }

    // const sub = await this.createNewSubscription(user, {
    //   planId: activeEntitlement.planId,
    //   licenseId: activeEntitlement.licenseId,
    // });
    // TODO: Renew subscription in Freemius
    activeEntitlement.isCanceled = false;

    await activeEntitlement.save();

    return activeEntitlement;
  }

  async upgradeSubscription(
    user: UserDocument,
    data: CreatePaymentCheckoutDto,
  ) {
    const entitlement = await PaymentEntitlementModel.findOne({
      user: user._id,
      isCanceled: false,
    });

    if (!entitlement) {
      throw new BadRequestException('No entitlement found');
    }

    return this.createFreemiusCheckout(user, {
      planId: data.planId,
      licenseId: entitlement.licenseId,
      coupon: data.coupon,
      billingCycle: data.billingCycle,
    });
  }

  async cancelSubscription(user: UserDocument) {
    const activeEntitlement = await this.getUserEntitlement(user);
    if (!activeEntitlement) {
      throw new BadRequestException('No entitlement found');
    }

    const purchase = await freemiusClient.retrievePurchase(
      activeEntitlement.licenseId,
    );

    if (!purchase || !purchase?.subscriptionId) {
      throw new BadRequestException(
        'Active Freemius subscription was not found',
      );
    }

    await freemiusClient.cancelSubscription(purchase.subscriptionId);

    return this.syncEntitlementFromLicense(activeEntitlement.licenseId);
  }

  async syncEntitlementFromLicense(licenseId: string) {
    const purchase = await freemiusClient.retrievePurchase(licenseId);

    if (!purchase) {
      throw new NotFoundException('Freemius purchase was not found');
    }

    return this.upsertPurchaseInfo(purchase);
  }

  private async upsertPurchaseInfo(purchase: PurchaseInfo) {
    const user = await UserModel.findOne({ email: purchase.email });

    if (!user) {
      return null;
    }

    const tariffType = await this.getTariffTypeByPlanId(purchase.planId);

    const entitlement = await PaymentEntitlementModel.findOneAndUpdate(
      { licenseId: purchase.licenseId },
      {
        user: user._id,
        licenseId: purchase.licenseId,
        planId: purchase.planId,
        priceId: purchase.pricingId,
        externalUserId: purchase.userId,
        type: 'subscription',
        expiration: purchase.renewalDate,
        isCanceled: purchase.canceled,
        subscriptionId: purchase.subscriptionId,
        ...(tariffType ? { tariffType } : {}),
      },
      { returnDocument: 'after', upsert: true },
    );

    return entitlement;
  }

  private async getTariffTypeByPlanId(
    planId: string,
  ): Promise<TariffType | any> {
    const plan = await freemiusClient.getPricing(planId);
    const tariffType = resolveTariffTypeByFreemiusPlanName(plan?.name);

    if (tariffType === TariffType.free) {
      throw new BadRequestException('Unknown or unsupported paid plan.');
    }

    return tariffType;
  }

  private buildFreeCouponLicenseId(
    coupon: CouponDocument,
    user: UserDocument,
  ): string {
    return `1977263-${coupon._id}-${user._id}`;
  }
}
