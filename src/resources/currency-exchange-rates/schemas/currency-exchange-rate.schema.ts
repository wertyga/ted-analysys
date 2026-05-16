import mongoose, { Document, Model, Schema } from 'mongoose';
import { CurrencySign } from '@/resources/codelist';

export interface CurrencyExchangeRate {
  date: Date;
  baseCurrency: CurrencySign.EUR;
  currency: CurrencySign;
  ratePerEuro: number;
  eurPerUnit: number;
  fetchedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CurrencyExchangeRateDocument = CurrencyExchangeRate & Document;

const CurrencyExchangeRateSchema = new Schema<CurrencyExchangeRateDocument>(
  {
    date: { type: Date, required: true, index: true },
    baseCurrency: {
      type: String,
      enum: [CurrencySign.EUR],
      required: true,
      default: CurrencySign.EUR,
    },
    currency: {
      type: String,
      enum: Object.values(CurrencySign),
      required: true,
      index: true,
    },
    ratePerEuro: { type: Number, required: true, min: 0 },
    eurPerUnit: { type: Number, required: true, min: 0 },
    fetchedAt: { type: Date, required: true },
  },
  {
    collection: 'currency_exchange_rates',
    timestamps: true,
  },
);

CurrencyExchangeRateSchema.index({ date: 1, currency: 1 }, { unique: true });

export const CurrencyExchangeRateModel: Model<CurrencyExchangeRateDocument> =
  (mongoose.models.CurrencyExchangeRate as
    | Model<CurrencyExchangeRateDocument>
    | undefined) ??
  mongoose.model<CurrencyExchangeRateDocument>(
    'CurrencyExchangeRate',
    CurrencyExchangeRateSchema,
  );
