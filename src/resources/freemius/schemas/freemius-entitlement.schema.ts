import mongoose, { Document, Model, Schema } from 'mongoose';
import type { PurchaseEntitlementType } from '@freemius/sdk';

export interface FreemiusEntitlement {
  user: mongoose.Types.ObjectId;
  fsLicenseId: string;
  fsPlanId: string;
  fsPricingId: string;
  fsUserId: string;
  type: PurchaseEntitlementType;
  expiration: Date | null;
  isCanceled: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export type FreemiusEntitlementDocument = FreemiusEntitlement & Document;

const FreemiusEntitlementSchema = new Schema<FreemiusEntitlementDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    fsLicenseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fsPlanId: {
      type: String,
      required: true,
      index: true,
    },
    fsPricingId: {
      type: String,
      required: true,
      index: true,
    },
    fsUserId: {
      type: String,
      required: true,
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
      default: null,
    },
    isCanceled: {
      type: Boolean,
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'freemius_entitlements',
    timestamps: true,
  },
);

FreemiusEntitlementSchema.index({ user: 1, type: 1 });

export const FreemiusEntitlementModel: Model<FreemiusEntitlementDocument> =
  (mongoose.models.FreemiusEntitlement as
    | Model<FreemiusEntitlementDocument>
    | undefined) ??
  mongoose.model<FreemiusEntitlementDocument>(
    'FreemiusEntitlement',
    FreemiusEntitlementSchema,
  );
