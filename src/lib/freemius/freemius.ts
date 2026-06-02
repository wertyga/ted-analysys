import {
  Freemius,
  PaymentEntity,
  PaymentFilterOptions,
  PortalPlans,
  PricingData,
  PurchaseInfo,
  SubscriptionCancellationReasonType,
  SubscriptionCancellationResult,
  UserPaymentFilterOptions,
  WebhookAuthenticationMethod,
  WebhookEvent,
  WebhookEventType,
  WebhookListenerResponse,
} from '@freemius/sdk';
import { IncomingHttpHeaders } from 'http';

type FreemiumCheckoutData = {
  user: {
    email: string;
    name?: string;
  };
  planId?: string;
  licenseId?: string;
  quota?: number;
  withRecommendation?: boolean;
};

type FreemiumPagination = {
  count?: number;
  offset?: number;
};

type FreemiumWebhookListenerConfig = {
  onError?: (error: unknown) => Promise<void>;
};

type FreemiumWebhookListener = {
  on(
    event: WebhookEventType | WebhookEventType[],
    handler: (event: WebhookEvent) => Promise<void>,
  ): void;
  process(input: {
    headers: IncomingHttpHeaders;
    rawBody: Buffer | string;
  }): Promise<WebhookListenerResponse>;
};

export class FreemiumClient {
  _freemius: Freemius | null = null;

  get freemius(): Freemius {
    if (!this._freemius) {
      const config = {
        productId: process.env.FREEMIUS_PRODUCT_ID,
        apiKey: process.env.FREEMIUS_API_KEY,
        secretKey: process.env.FREEMIUS_SECRET_KEY,
        publicKey: process.env.FREEMIUS_PUBLIC_KEY,
      };

      const missingConfig = Object.entries(config)
        .filter(([, value]) => !value)
        .map(([key]) => key);

      if (missingConfig.length) {
        throw new Error(
          `Missing Freemius configuration: ${missingConfig.join(', ')}`,
        );
      }

      this._freemius = new Freemius({
        productId: config.productId!,
        apiKey: config.apiKey!,
        secretKey: config.secretKey!,
        publicKey: config.publicKey!,
      });
    }

    return this._freemius;
  }

  async createCheckout(data: FreemiumCheckoutData) {
    const checkout = await this.freemius.checkout.create({
      user: data.user,
      // TODO: Remove when done
      isSandbox: true,
      planId: data.planId,
      licenseId: data.licenseId,
      quota: data.quota,
      withRecommendation: data.withRecommendation,
    });

    return checkout.serialize();
  }

  getPricingList(): Promise<PricingData> {
    return this.freemius.pricing.retrieve();
  }

  async getPricing(
    planId: string | undefined,
  ): Promise<PortalPlans[number] | undefined> {
    if (!planId) {
      return undefined;
    }
    const list = await this.getPricingList();

    return list?.plans?.find((price) => price.id === planId);
  }

  getUserPayments(
    userId: string,
    filters?: UserPaymentFilterOptions,
    pagination?: FreemiumPagination,
  ): Promise<PaymentEntity[]> {
    return this.freemius.api.user.retrievePayments(userId, filters, pagination);
  }

  searchPaymentsByEmail(
    email: string,
    pagination?: FreemiumPagination,
  ): Promise<PaymentEntity[]> {
    const filters: PaymentFilterOptions = { search: email };

    return this.freemius.api.payment.retrieveMany(filters, pagination);
  }

  retrievePurchase(licenseId: string): Promise<PurchaseInfo | null> {
    return this.freemius.purchase.retrievePurchase(licenseId);
  }

  cancelSubscription(
    subscriptionId: string,
    feedback?: string,
    reasonIds?: SubscriptionCancellationReasonType[],
  ): Promise<SubscriptionCancellationResult | null> {
    return this.freemius.api.subscription.cancel(
      subscriptionId,
      feedback,
      reasonIds,
    );
  }

  createWebhookListener(
    config: FreemiumWebhookListenerConfig = {},
  ): FreemiumWebhookListener {
    return this.freemius.webhook.createListener({
      authenticationMethod: WebhookAuthenticationMethod.SignatureHeader,
      onError: config.onError,
    }) as FreemiumWebhookListener;
  }

  processWebhook(
    listener: FreemiumWebhookListener,
    headers: IncomingHttpHeaders,
    rawBody: Buffer | string,
  ) {
    return listener.process({ headers, rawBody });
  }
}

export const freemiusClient = new FreemiumClient();
