import { Injectable } from '@nestjs/common';
import { freemiusClient } from '@/lib/freemius';
import { WebhookEvent, WebhookEventType } from '@freemius/sdk';
import { PaymentEntitlementModel } from '@/resources/payments/schemas/payment-entitlement.schema';
import { IncomingHttpHeaders } from 'http';
import { PaymentsService } from '@/resources/payments/payments.service';

type FreemiusWebhookListener = ReturnType<
  typeof freemiusClient.createWebhookListener
>;

@Injectable()
export class PaymentsWebhookService {
  private webhookListener?: FreemiusWebhookListener;

  constructor(private paymentsService: PaymentsService) {}

  async processWebhook(headers: IncomingHttpHeaders, rawBody: Buffer | string) {
    const listener = this.getWebhookListener();

    return freemiusClient.processWebhook(listener, headers, rawBody);
  }

  private getWebhookListener(): FreemiusWebhookListener {
    if (this.webhookListener) {
      return this.webhookListener;
    }

    const listener = freemiusClient.createWebhookListener({
      onError: async (error) => {
        console.error('Freemius webhook processing error:', error);
      },
    });

    // const licenseEvents: WebhookEventType[] = [
    //   'license.created',
    //   'license.extended',
    //   'license.shortened',
    //   'license.updated',
    //   'license.cancelled',
    //   'license.expired',
    //   'license.plan.changed',
    // ];
    const subscriptionSyncEvents: WebhookEventType[] = [
      'subscription.created',
      'subscription.renewal.failed',
      'subscription.renewal.failed.last',
    ];

    // listener.on(licenseEvents, async (event) => {
    //   const {
    //     objects: { license },
    //   } = event;
    //   console.log('licenseEvents', { event });
    //   if (license && license.id) {
    //     await this.paymentsService.syncEntitlementFromLicense(
    //       String(license.id),
    //     );
    //   }
    // });

    listener.on(subscriptionSyncEvents, async (event: WebhookEvent) => {
      const data = (event as unknown as { data?: { license_id?: string } })
        .data;
      const licenseId = data?.license_id;

      if (licenseId) {
        await this.paymentsService.syncEntitlementFromLicense(licenseId);
      }
    });

    listener.on('subscription.cancelled', async (event: WebhookEvent) => {
      const { subscription_id } = (event as any).data ?? {};

      if (subscription_id) {
        await PaymentEntitlementModel.findOneAndUpdate(
          {
            subscriptionId: subscription_id,
          },
          {
            $set: {
              isCanceled: true,
            },
          },
          { returnDocument: 'after' },
        );
      }
    });

    this.webhookListener = listener;

    return listener;
  }
}
