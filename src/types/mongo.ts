import mongoose from 'mongoose';

export type TSerializeOptions<T = any> = Partial<{
  excludeFields: (keyof T)[];
  includeFields: (keyof T)[];
}>;

export type TMongoId = string | mongoose.Types.ObjectId;
