import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckoutRedirectInfo,
  PurchaseInfo,
  SubscriptionCancellationReasonType,
  WebhookAuthenticationMethod,
  WebhookEvent,
  WebhookEventType,
} from '@freemius/sdk';
import { IncomingHttpHeaders } from 'http';
import { getFreemius } from '@/lib/freemius/freemius';
import { UserModel } from '@/resources/user/user.schema';
import { UserDocument } from '@/resources/user/user.types';
import { filterModel, isDev } from '@/utils';
import {
  PaymentEntitlementDocument,
  PaymentEntitlementModel,
} from './schemas/payment-entitlement.schema';
import { resolveTariffTypeByFreemiusPlanName } from '@/resources/tariff/freemius-tariff';
import { TariffType } from '@/resources/tariff/tariff.types';
import { TARIFF_RANK } from '@/resources/tariff/tariff-rules';
import {
  CancelPaymentSubscriptionDto,
  ChangePaymentSubscriptionDto,
  CreatePaymentCheckoutDto,
} from './dto/payments.dto';

type CheckoutPurchasePayload = {
  purchase?: { license_id?: string };
  trial?: { license_id?: string };
};

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
  async createCheckout(user: UserDocument, data: CreatePaymentCheckoutDto) {
    const activeEntitlement = await this.getActiveEntitlement(user);

    if (!activeEntitlement) {
      return this.createNewSubscriptionCheckout(user, data);
    }

    if (!data.planId) {
      return this.rejectActiveSubscriptionPurchase();
    }

    return this.createSubscriptionChangeCheckout(user, {
      planId: data.planId,
      quota: data.quota,
      withRecommendation: data.withRecommendation,
    });
  }

  async createNewSubscriptionCheckout(
    user: UserDocument,
    data: CreatePaymentCheckoutDto,
  ) {
    const activeEntitlement = await this.getActiveEntitlement(user);

    if (activeEntitlement) {
      return this.rejectActiveSubscriptionPurchase();
    }

    return this.createFreemiusCheckout(user, data);
  }

  rejectActiveSubscriptionPurchase(): never {
    throw new ConflictException(
      'User already has an active subscription for the current paid period.',
    );
  }

  private async createFreemiusCheckout(
    user: UserDocument,
    data: FreemiusCheckoutData,
  ) {
    const freemius = getFreemius();
    const checkout = await freemius.checkout.create({
      user: {
        email: user.email,
        name: user.companyName,
      },
      isSandbox: isDev,
      planId: data.planId,
      licenseId: data.licenseId,
      quota: data.quota,
      withRecommendation: data.withRecommendation,
    });

    return checkout.serialize();
  }

  async processCheckoutPurchase(payload: CheckoutPurchasePayload) {
    const licenseId = payload.purchase?.license_id ?? payload.trial?.license_id;

    if (!licenseId) {
      throw new BadRequestException('Missing Freemius license id');
    }

    return this.syncEntitlementFromLicense(licenseId);
  }

  async processRedirect(currentUrl: string, proxyUrl?: string) {
    const freemius = getFreemius();
    const redirectInfo = await freemius.checkout.processRedirect(
      currentUrl,
      proxyUrl,
    );

    if (!redirectInfo?.license_id) {
      throw new BadRequestException('Invalid Freemius checkout redirect');
    }

    return this.syncEntitlementFromRedirect(redirectInfo);
  }

  async getActiveEntitlement(
    user: UserDocument,
  ): Promise<ActivePaymentEntitlement | undefined> {
    const activeEntitlements = await PaymentEntitlementModel.find({
      user: user._id,
      type: 'subscription',
      $or: [{ expiration: null }, { expiration: { $gt: new Date() } }],
    }).sort({ createdAt: -1 });

    if (activeEntitlements.length > 1) {
      return this.resolveMultipleActiveEntitlements(user);
    }

    return activeEntitlements[0];
  }

  async getPricing() {
    return getFreemius().pricing.retrieve();
  }

  async getCustomerPortal(user: UserDocument, endpoint: string) {
    const activeEntitlement = await this.getActiveEntitlement(user);

    return getFreemius().customerPortal.retrieveDataByEmail({
      email: user.email,
      endpoint,
      primaryLicenseId: activeEntitlement?.licenseId,
      sandbox: isDev,
    });
  }

  async processCustomerPortalAction(request: Request) {
    const freemius = getFreemius();

    return freemius.customerPortal.request.process(
      {
        portalEndpoint: this.getPortalEndpoint(request.url),
        isSandbox: isDev,
        getUser: async () => {
          const email = new URL(request.url).searchParams.get('email');

          if (!email) {
            return null;
          }

          const fsUser = await freemius.api.user.retrieveByEmail(email);

          if (!fsUser?.id) {
            return { email };
          }

          return { id: fsUser.id, email: fsUser.email ?? email };
        },
        onRestore: freemius.customerPortal.createRestorer((purchase) =>
          this.processPurchaseInfo(purchase),
        ),
      },
      request,
    );
  }

  async createSubscriptionChangeCheckout(
    user: UserDocument,
    data: ChangePaymentSubscriptionDto,
  ) {
    const activeEntitlement = await this.getRequiredActiveEntitlement(user);
    const targetTariffType = await this.getTariffTypeByPlanId(data.planId);
    const currentTariffType =
      await this.getEntitlementTariffType(activeEntitlement);

    if (targetTariffType === currentTariffType) {
      if (activeEntitlement.isCanceled) {
        return this.reactivateCanceledSubscription(user, data);
      }

      return this.rejectActiveSubscriptionPurchase();
    }

    if (this.isTariffUpgrade(currentTariffType, targetTariffType)) {
      return this.createSubscriptionUpgradeCheckout(user, data);
    }

    return this.createSubscriptionDowngradeCheckout(user, data);
  }

  async reactivateCanceledSubscription(
    user: UserDocument,
    data: ChangePaymentSubscriptionDto,
  ) {
    const activeEntitlement = await this.getRequiredActiveEntitlement(user);

    if (!activeEntitlement.isCanceled) {
      return this.rejectActiveSubscriptionPurchase();
    }

    const targetTariffType = await this.getTariffTypeByPlanId(data.planId);
    const currentTariffType =
      await this.getEntitlementTariffType(activeEntitlement);

    if (targetTariffType !== currentTariffType) {
      throw new BadRequestException(
        'Reactivation is only available for the same subscription plan.',
      );
    }

    return this.createFreemiusCheckout(user, {
      planId: data.planId,
      quota: data.quota,
      withRecommendation: data.withRecommendation,
      licenseId: activeEntitlement.licenseId,
    });
  }

  async createSubscriptionUpgradeCheckout(
    user: UserDocument,
    data: ChangePaymentSubscriptionDto,
  ) {
    const activeEntitlement = await this.getRequiredActiveEntitlement(user);
    const targetTariffType = await this.getTariffTypeByPlanId(data.planId);
    const currentTariffType =
      await this.getEntitlementTariffType(activeEntitlement);

    if (!this.isTariffUpgrade(currentTariffType, targetTariffType)) {
      throw new BadRequestException(
        'Target subscription plan is not higher than the current plan.',
      );
    }

    return this.createFreemiusCheckout(user, {
      planId: data.planId,
      quota: data.quota,
      withRecommendation: data.withRecommendation,
      licenseId: activeEntitlement.licenseId,
    });
  }

  async createSubscriptionDowngradeCheckout(
    user: UserDocument,
    data: ChangePaymentSubscriptionDto,
  ) {
    const activeEntitlement = await this.getRequiredActiveEntitlement(user);
    const targetTariffType = await this.getTariffTypeByPlanId(data.planId);
    const currentTariffType =
      await this.getEntitlementTariffType(activeEntitlement);

    if (!this.isTariffDowngrade(currentTariffType, targetTariffType)) {
      throw new BadRequestException(
        'Target subscription plan is not lower than the current plan.',
      );
    }

    return this.createFreemiusCheckout(user, {
      planId: data.planId,
      quota: data.quota,
      withRecommendation: data.withRecommendation,
      licenseId: activeEntitlement.licenseId,
    });
  }

  async cancelSubscription(
    user: UserDocument,
    data: CancelPaymentSubscriptionDto,
  ) {
    const freemius = getFreemius();
    const activeEntitlement = await this.getRequiredActiveEntitlement(user);
    const purchase = await freemius.purchase.retrievePurchase(
      activeEntitlement.licenseId,
    );

    if (!purchase?.subscriptionId) {
      throw new BadRequestException(
        'Active Freemius subscription was not found',
      );
    }

    const result = await freemius.api.subscription.cancel(
      purchase.subscriptionId,
      data.feedback,
      data.reasonIds as SubscriptionCancellationReasonType[] | undefined,
    );

    if (!result) {
      throw new BadRequestException('Failed to cancel Freemius subscription');
    }

    await this.syncEntitlementFromLicense(activeEntitlement.licenseId);

    return result;
  }

  async processWebhook(headers: IncomingHttpHeaders, rawBody: Buffer | string) {
    const freemius = getFreemius();
    const listener = freemius.webhook.createListener({
      authenticationMethod: WebhookAuthenticationMethod.SignatureHeader,
      onError: async (error) => {
        console.error('Freemius webhook processing error:', error);
      },
    });

    const licenseEvents: WebhookEventType[] = [
      'license.created',
      'license.extended',
      'license.shortened',
      'license.updated',
      'license.cancelled',
      'license.expired',
      'license.plan.changed',
    ];
    const subscriptionEvents: WebhookEventType[] = [
      'subscription.created',
      'subscription.cancelled',
      'subscription.renewal.failed',
      'subscription.renewal.failed.last',
    ];
    const ignoredEvents = [
      'card.updated',
      'cart.completed',
      'payment.created',
      'user.card.created',
    ] as unknown as WebhookEventType[];

    listener.on(licenseEvents, async ({ objects: { license } }) => {
      if (license && license.id) {
        await this.syncEntitlementFromLicense(String(license.id));
      }
    });

    listener.on(subscriptionEvents, async (event: WebhookEvent) => {
      const data = (event as unknown as { data?: { license_id?: string } })
        .data;

      const license = event.objects?.license;
      const licenseId = data?.license_id ?? (license && license.id);

      if (licenseId) {
        await this.syncEntitlementFromLicense(String(licenseId));
      }
    });

    listener.on('license.deleted', async ({ data }) => {
      await this.deleteEntitlement(data.license_id);
    });

    listener.on(ignoredEvents, async () => {});

    return listener.process({ headers, rawBody });
  }

  private async syncEntitlementFromRedirect(info: CheckoutRedirectInfo) {
    const freemius = getFreemius();
    const purchase = await freemius.purchase.retrievePurchase(info.license_id);

    if (!purchase) {
      throw new NotFoundException('Freemius purchase was not found');
    }

    return this.processPurchaseInfo(purchase);
  }

  private async syncEntitlementFromLicense(licenseId: string) {
    const freemius = getFreemius();
    const purchase = await freemius.purchase.retrievePurchase(licenseId);

    if (!purchase) {
      throw new NotFoundException('Freemius purchase was not found');
    }

    return this.processPurchaseInfo(purchase);
  }

  private async processPurchaseInfo(purchase: PurchaseInfo) {
    const user = await UserModel.findOne({ email: purchase.email });

    if (!user) {
      return null;
    }

    const entitlementRecord = purchase.toEntitlementRecord({
      user: user._id,
    });
    const tariffType = await this.getPurchaseTariffType(purchase);

    const entitlement = await PaymentEntitlementModel.findOneAndUpdate(
      { licenseId: purchase.licenseId },
      {
        user: entitlementRecord.user,
        licenseId: entitlementRecord.fsLicenseId,
        planId: entitlementRecord.fsPlanId,
        priceId: entitlementRecord.fsPricingId,
        externalUserId: entitlementRecord.fsUserId,
        type: entitlementRecord.type,
        expiration: entitlementRecord.expiration,
        isCanceled: entitlementRecord.isCanceled,
        createdAt: entitlementRecord.createdAt,
        ...(tariffType ? { tariffType } : {}),
      },
      { returnDocument: 'after', upsert: true },
    );

    if (purchase.isActive && purchase.isSubscription()) {
      await PaymentEntitlementModel.updateMany(
        {
          user: user._id,
          type: 'subscription',
          licenseId: { $ne: purchase.licenseId },
          isCanceled: false,
        },
        { isCanceled: true },
      );
    }

    return filterModel(entitlement as PaymentEntitlementDocument);
  }

  private async deleteEntitlement(licenseId: string) {
    await PaymentEntitlementModel.deleteOne({ licenseId });
  }

  private async getPurchaseTariffType(
    purchase: PurchaseInfo,
  ): Promise<TariffType | undefined> {
    const pricing = await getFreemius().pricing.retrieve();

    const plan = pricing.plans?.find(
      (item) => String(item.id) === String(purchase.planId),
    );

    return resolveTariffTypeByFreemiusPlanName(plan?.name);
  }

  private async getTariffTypeByPlanId(planId: string): Promise<TariffType> {
    const pricing = await getFreemius().pricing.retrieve();
    const plan = pricing.plans?.find((item) => String(item.id) === planId);
    const tariffType = resolveTariffTypeByFreemiusPlanName(plan?.name);

    if (tariffType === TariffType.FREE) {
      throw new BadRequestException('Unknown or unsupported paid plan.');
    }

    return tariffType;
  }

  private async getEntitlementTariffType(
    entitlement: ActivePaymentEntitlement,
  ): Promise<TariffType> {
    return entitlement.tariffType && entitlement.tariffType !== TariffType.FREE
      ? entitlement.tariffType
      : this.getTariffTypeByPlanId(entitlement.planId);
  }

  private isTariffUpgrade(
    currentTariffType: TariffType,
    targetTariffType: TariffType,
  ): boolean {
    return TARIFF_RANK[targetTariffType] > TARIFF_RANK[currentTariffType];
  }

  private isTariffDowngrade(
    currentTariffType: TariffType,
    targetTariffType: TariffType,
  ): boolean {
    return TARIFF_RANK[targetTariffType] < TARIFF_RANK[currentTariffType];
  }

  private async getRequiredActiveEntitlement(user: UserDocument) {
    const activeEntitlement = await this.getActiveEntitlement(user);

    if (!activeEntitlement) {
      throw new NotFoundException('Active Freemius subscription was not found');
    }

    return activeEntitlement;
  }

  private getPortalEndpoint(url: string) {
    const parsedUrl = new URL(url);
    parsedUrl.search = '';

    return parsedUrl.toString();
  }

  private async resolveMultipleActiveEntitlements(user: UserDocument) {
    const activeEntitlements = await PaymentEntitlementModel.find({
      user: user._id,
      type: 'subscription',
      $or: [{ expiration: null }, { expiration: { $gt: new Date() } }],
    }).sort({ createdAt: -1 });

    const [latestEntitlement, ...staleEntitlements] = activeEntitlements;

    if (!latestEntitlement) {
      return null;
    }

    if (staleEntitlements.length) {
      await PaymentEntitlementModel.updateMany(
        {
          _id: { $in: staleEntitlements.map((entitlement) => entitlement._id) },
        },
        { isCanceled: true },
      );
    }

    return filterModel(latestEntitlement);
  }
}
