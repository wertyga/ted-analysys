import mongoose, { Document, Model, Schema } from 'mongoose';
import type { PurchaseEntitlementType } from '@freemius/sdk';
import { TariffType } from '@/resources/tariff/tariff.types';

export interface PaymentEntitlement {
  user: mongoose.Types.ObjectId;
  licenseId: string;
  planId: string;
  priceId: string;
  subscriptionId: string;
  externalUserId: string;
  tariffType?: TariffType;
  type: PurchaseEntitlementType;
  expiration: Date | null;
  isCanceled: boolean;
  isTrial: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export type PaymentEntitlementDocument = PaymentEntitlement & Document;

const PaymentEntitlementSchema = new Schema<PaymentEntitlementDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    licenseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      index: true,
    },
    priceId: {
      type: String,
      required: true,
      index: true,
    },
    subscriptionId: {
      type: String,
      required: true,
      index: true,
    },
    externalUserId: {
      type: String,
      required: true,
      index: true,
    },
    tariffType: {
      type: String,
      enum: TariffType,
      index: true,
    },
    type: {
      type: String,
      enum: ['subscription', 'oneoff'],
      required: true,
      index: true,
    },
    expiration: {
      type: Date,
    },
    isCanceled: {
      type: Boolean,
      required: true,
    },
    isTrial: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    collection: 'payments_entitlements',
    timestamps: true,
  },
);

PaymentEntitlementSchema.index({ user: 1, type: 1 });

export const PaymentEntitlementModel: Model<PaymentEntitlementDocument> =
  (mongoose.models.PaymentEntitlement as
    | Model<PaymentEntitlementDocument>
    | undefined) ??
  mongoose.model<PaymentEntitlementDocument>(
    'PaymentEntitlement',
    PaymentEntitlementSchema,
  );
