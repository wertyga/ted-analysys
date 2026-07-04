import { Injectable } from '@nestjs/common';
import { SettingModel } from './settings.schema';

@Injectable()
export class SettingsService {
  async get<T>(key: string): Promise<T | undefined> {
    const setting = await SettingModel.findOne({ key }).lean();

    return setting?.value as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<T> {
    await SettingModel.updateOne(
      { key },
      { $set: { value } },
      { upsert: true },
    ).exec();

    return value;
  }
}
