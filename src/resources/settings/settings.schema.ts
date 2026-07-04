import mongoose, { Document, Model, Schema } from 'mongoose';

export interface Setting {
  key: string;
  value: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SettingDocument = Setting & Document;

export const SettingSchema = new Schema<SettingDocument>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, default: null },
  },
  {
    collection: 'settings',
    timestamps: true,
  },
);

export const SettingModel: Model<SettingDocument> =
  (mongoose.models.Setting as Model<SettingDocument> | undefined) ??
  mongoose.model<SettingDocument>('Setting', SettingSchema);
