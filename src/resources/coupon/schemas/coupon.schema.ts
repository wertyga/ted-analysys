import mongoose, { Document, Model, Schema } from 'mongoose';

export interface Coupon {
  code: string;
  usedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CouponDocument = Coupon & Document;

const CouponSchema = new Schema<CouponDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    usedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
  },
  {
    collection: 'coupons',
    timestamps: true,
  },
);

CouponSchema.index({ usedBy: 1 });

export const CouponModel: Model<CouponDocument> =
  (mongoose.models.Coupon as Model<CouponDocument> | undefined) ??
  mongoose.model<CouponDocument>('Coupon', CouponSchema);
