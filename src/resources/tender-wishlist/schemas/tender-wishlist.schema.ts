import { getTenderModelName } from '@/resources/national-tenders/core/national-tender.serializer';
import mongoose, { Document, Model, Schema } from 'mongoose';

export interface TenderWishlistItem {
  user: mongoose.Types.ObjectId;
  /** `_id` in `tenders`, or in `national_tenders` for national ids. */
  tender: mongoose.Types.ObjectId;
  tenderId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TenderWishlistItemDocument = TenderWishlistItem & Document;

const TenderWishlistItemSchema = new Schema<TenderWishlistItemDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tender: {
      type: Schema.Types.ObjectId,
      // Polymorphic by `tenderId`: TED tender or national tender.
      ref: function (this: { tenderId?: string }) {
        return getTenderModelName(this.tenderId ?? '');
      },
      required: true,
      index: true,
    },
    tenderId: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    collection: 'tender_wishlist_items',
    timestamps: true,
  },
);

TenderWishlistItemSchema.index({ user: 1, tender: 1 }, { unique: true });
TenderWishlistItemSchema.index({ user: 1, tenderId: 1 }, { unique: true });

export const TenderWishlistItemModel: Model<TenderWishlistItemDocument> =
  (mongoose.models.TenderWishlistItem as
    | Model<TenderWishlistItemDocument>
    | undefined) ??
  mongoose.model<TenderWishlistItemDocument>(
    'TenderWishlistItem',
    TenderWishlistItemSchema,
  );
