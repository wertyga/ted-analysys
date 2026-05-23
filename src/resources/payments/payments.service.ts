import {
  BadRequestException,
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
import type { TariffType } from '@/resources/tariff/tariff.types';
import {
  CancelPaymentSubscriptionDto,
  ChangePaymentSubscriptionDto,
  CreatePaymentCheckoutDto,
} from './dto/payments.dto';

type CheckoutPurchasePayload = {
  purchase?: { license_id?: string };
  trial?: { license_id?: string };
};

@Injectable()
export class PaymentsService {
  async createCheckout(user: UserDocument, data: CreatePaymentCheckoutDto) {
    if (!data.licenseId) {
      const activeEntitlement = await this.getActiveEntitlement(user);

      if (activeEntitlement) {
        throw new BadRequestException(
          'User already has an active Freemius subscription. Use subscription/change-checkout to change it.',
        );
      }
    }

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

  async getActiveEntitlement(user: UserDocument) {
    const entitlements = await PaymentEntitlementModel.find({
      user: user._id,
      type: 'subscription',
    }).lean();

    try {
      return getFreemius().entitlement.getActive(entitlements);
    } catch (error) {
      if (error.message.includes('Multiple active entitlements found')) {
        return this.resolveMultipleActiveEntitlements(user);
      }

      throw error;
    }
  }

  async getPricing() {
    return getFreemius().pricing.retrieve();
  }

  async getCustomerPortal(user: UserDocument, endpoint: string) {
    const activeEntitlement = await this.getActiveEntitlement(user);

    return getFreemius().customerPortal.retrieveDataByEmail({
      email: user.email,
      endpoint,
      primaryLicenseId: activeEntitlement?.fsLicenseId,
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

    return this.createCheckout(user, {
      planId: data.planId,
      quota: data.quota,
      withRecommendation: data.withRecommendation,
      licenseId: activeEntitlement.fsLicenseId,
    });
  }

  async cancelSubscription(
    user: UserDocument,
    data: CancelPaymentSubscriptionDto,
  ) {
    const freemius = getFreemius();
    const activeEntitlement = await this.getRequiredActiveEntitlement(user);
    const purchase = await freemius.purchase.retrievePurchase(
      activeEntitlement.fsLicenseId,
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

    await this.syncEntitlementFromLicense(activeEntitlement.fsLicenseId);

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
      { fsLicenseId: purchase.licenseId },
      {
        ...entitlementRecord,
        ...(tariffType ? { tariffType } : {}),
      },
      { returnDocument: 'after', upsert: true },
    );

    if (purchase.isActive && purchase.isSubscription()) {
      await PaymentEntitlementModel.updateMany(
        {
          user: user._id,
          type: 'subscription',
          fsLicenseId: { $ne: purchase.licenseId },
          isCanceled: false,
        },
        { isCanceled: true },
      );
    }

    return filterModel(entitlement as PaymentEntitlementDocument);
  }

  private async deleteEntitlement(fsLicenseId: string) {
    await PaymentEntitlementModel.deleteOne({ fsLicenseId });
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
      isCanceled: false,
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
