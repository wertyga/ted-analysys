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

export enum FreemiusBillingCycle {
  monthly = 'monthly',
  annual = 'annual',
}

type FreemiumCheckoutData = {
  user: {
    email: string;
    name?: string;
  };
  planId?: string;
  licenseId?: string;
  quota?: number;
  coupon?: string;
  billingCycle: FreemiusBillingCycle;
};

type FreemiumPagination = {
  count?: number;
  offset?: number;
};

export type FreemiumCouponFilters = FreemiumPagination & {
  code?: string;
  is_enriched?: boolean;
  prefix?: string;
  search?: string;
};

export type FreemiumCoupon = {
  id?: string | number;
  created?: string;
  updated?: string;
  entity_id?: string;
  entity_type?: 'plugin' | 'store' | 'marketplace';
  plans?: string | null;
  licenses?: string | null;
  billing_cycles?: string | null;
  code?: string;
  discount?: number;
  discount_type?: 'percentage' | 'dollar' | string;
  start_date?: string;
  end_date?: string;
  redemptions?: number;
  redemptions_limit?: number | null;
  has_renewals_discount?: boolean;
  has_addons_discount?: boolean;
  is_one_per_user?: boolean;
  is_active?: boolean;
  user_type?: 'all' | 'new' | 'current' | 'previous' | 'customer' | 'migrated';
  source?: string | null;
  discounts?: Record<string, never>;
};

type FreemiumWebhookListenerConfig = {
  onError?: (error: unknown) => Promise<void>;
};

type FreemiusCouponsResponse = {
  coupons?: FreemiumCoupon[];
};

type FreemiusApiResponse<T> = {
  data?: T;
  response: {
    status: number;
  };
};

type FreemiusApiClient = {
  GET(
    path: '/products/{product_id}/coupons.json',
    options: {
      params: {
        path: {
          product_id: string;
        };
        query?: FreemiumCouponFilters;
      };
    },
  ): Promise<FreemiusApiResponse<FreemiusCouponsResponse>>;
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

  async getCoupons(
    filters: FreemiumCouponFilters = {},
  ): Promise<FreemiumCoupon[]> {
    const apiClient = this.freemius.api
      .__unstable_ApiClient as FreemiusApiClient;
    const response = await apiClient.GET(
      '/products/{product_id}/coupons.json',
      {
        params: {
          path: {
            product_id: this.freemius.api.productId,
          },
          query: filters,
        },
      },
    );

    if (response.response.status < 200 || response.response.status >= 300) {
      return [];
    }

    return response.data?.coupons ?? [];
  }

  async createCheckout(data: FreemiumCheckoutData) {
    const checkout = await this.freemius.checkout.create({
      user: data.user,
      // TODO: Remove when done
      isSandbox: true,
      planId: data.planId,
      licenseId: data.licenseId,
      quota: data.quota,
    });

    checkout.setBillingCycle(data.billingCycle);

    if (data.coupon) {
      checkout.setCoupon({
        code: data.coupon,
      });
    }

    return checkout.serialize();
  }

  async getPricingList(): Promise<
    PricingData & { coupon?: string; couponDiscount?: number }
  > {
    const [[coupon], pricing] = await Promise.all([
      this.getCoupons(),
      this.freemius.pricing.retrieve(),
    ]);

    if (coupon?.is_active) {
      return {
        ...pricing,
        plans: pricing.plans.map((plan) => {
          return {
            ...plan,
            coupon: coupon.code,
            couponDiscount: coupon.discount,
          };
        }),
      };
    }

    return pricing;
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
