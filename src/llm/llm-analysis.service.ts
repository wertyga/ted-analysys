import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseLlmAnalysisService } from './base-llm-analysis.service';
import { isRecord } from '@/utils';

export interface TenderShortTitleInput {
  id: string;
  title: string;
}

export interface TenderShortTitleResult {
  id: string;
  shortTitle: {
    en: string;
    de: string;
    fr: string;
    pl: string;
    ru: string;
  };
}

type LlmProvider = 'deepseek' | 'openai';
type LlmAnalysisPurpose = 'general' | 'deep';

interface LlmProviderConnection {
  client: OpenAI;
  model: string;
  provider: LlmProvider;
  providerName: string;
}

@Injectable()
export class LlmAnalysisService extends BaseLlmAnalysisService {
  private readonly generalConnection: LlmProviderConnection;
  private readonly deepConnection: LlmProviderConnection;

  constructor(private readonly configService: ConfigService) {
    super('LLM', new Logger(LlmAnalysisService.name));

    this.generalConnection = this.createConnection(
      'general',
      this.resolveProvider('GENERAL_ANALYSIS_PROVIDER'),
      'GENERAL_ANALYSIS_MODEL',
    );
    this.deepConnection = this.createConnection(
      'deep',
      this.resolveProvider('DEEP_ANALYSIS_PROVIDER'),
      'DEEP_ANALYSIS_MODEL',
    );
  }

  private resolveProvider(purposeProviderKey: string): LlmProvider {
    const provider =
      this.getFirstConfigValue(`LLM_${purposeProviderKey}`, 'LLM_PROVIDER')
        ?.toLowerCase() ?? 'deepseek';

    if (provider === 'deepseek' || provider === 'openai') {
      return provider;
    }

    throw new ServiceUnavailableException(
      `Unsupported LLM provider "${provider}". Use "deepseek" or "openai".`,
    );
  }

  getProvider(): LlmProvider {
    return this.getGeneralAnalysisProvider();
  }

  getGeneralAnalysisProvider(): LlmProvider {
    return this.generalConnection.provider;
  }

  getDeepAnalysisProvider(): LlmProvider {
    return this.deepConnection.provider;
  }

  getGeneralAnalysisModel(): string {
    return this.generalConnection.model;
  }

  getDeepAnalysisModel(): string {
    return this.deepConnection.model;
  }

  async generateTenderShortTitles(
    input: TenderShortTitleInput[],
  ): Promise<TenderShortTitleResult[]> {
    const response = await this.generalConnection.client.chat.completions.create({
      model: this.generalConnection.model,
      messages: [
        {
          role: 'system',
          content: [
            'You rewrite public procurement tender titles into short, clear, user-facing titles.',
            'For each input item, preserve the id exactly.',
            'Create shortTitle translations in English, German, French, Polish, and Russian.',
            'Keep each title concise, ideally 5-10 words.',
            'Preserve the procurement subject and avoid adding facts not present in the source title.',
            'Return JSON only in this exact shape: {"items":[{"id":"...","en":"...","de":"...","fr":"...","pl":"...","ru":"..."}]}.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({ items: input }, null, 2),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      stream: false,
    });
    const responseText = response.choices[0]?.message.content;

    if (!responseText) {
      throw new Error(
        `${this.generalConnection.providerName} response did not contain message content`,
      );
    }

    const parsed = JSON.parse(responseText) as unknown;

    return this.validateTenderShortTitles(parsed);
  }

  protected async createProviderJsonResponse(
    prompt: string,
    context: string,
    purpose: LlmAnalysisPurpose,
  ): Promise<string> {
    const connection = this.getConnection(purpose);
    const response = await connection.client.chat.completions.create({
      model: connection.model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: context },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      stream: false,
    });
    const responseText = response.choices[0]?.message.content;

    if (!responseText) {
      throw new Error(
        `${connection.providerName} response did not contain message content`,
      );
    }

    return responseText;
  }

  private createConnection(
    purpose: LlmAnalysisPurpose,
    provider: LlmProvider,
    modelKey: string,
  ): LlmProviderConnection {
    return {
      client: new OpenAI({
        apiKey: this.getApiKey(provider, purpose),
        baseURL: this.getBaseUrl(provider, purpose),
      }),
      model: this.getModelConfig(provider, modelKey),
      provider,
      providerName: this.getProviderName(provider),
    };
  }

  private getConnection(purpose: LlmAnalysisPurpose): LlmProviderConnection {
    return purpose === 'deep' ? this.deepConnection : this.generalConnection;
  }

  private getApiKey(provider: LlmProvider, purpose: LlmAnalysisPurpose): string {
    const providerPrefix = provider === 'openai' ? 'OPENAI' : 'DEEPSEEK';
    const apiKey = this.getFirstConfigValue(
      `LLM_${purpose.toUpperCase()}_ANALYSIS_API_KEY`,
      'LLM_API_KEY',
      `${providerPrefix}_API_KEY`,
    );

    if (!apiKey) {
      throw new ServiceUnavailableException(
        `LLM API key is not configured. Set LLM_API_KEY or ${providerPrefix}_API_KEY.`,
      );
    }

    return apiKey;
  }

  private getBaseUrl(
    provider: LlmProvider,
    purpose: LlmAnalysisPurpose,
  ): string | undefined {
    const providerPrefix = provider === 'openai' ? 'OPENAI' : 'DEEPSEEK';
    const baseUrl = this.getFirstConfigValue(
      `LLM_${purpose.toUpperCase()}_ANALYSIS_BASE_URL`,
      'LLM_BASE_URL',
      `${providerPrefix}_BASE_URL`,
      `${providerPrefix}_API_BASE_URL`,
    );

    if (baseUrl) {
      return baseUrl;
    }

    return provider === 'deepseek' ? 'https://api.deepseek.com' : undefined;
  }

  private getModelConfig(provider: LlmProvider, modelKey: string): string {
    const providerPrefix = provider === 'openai' ? 'OPENAI' : 'DEEPSEEK';
    const sharedKey = `LLM_${modelKey}`;
    const providerKey = `${providerPrefix}_${modelKey}`;
    const value = this.getFirstConfigValue(sharedKey, providerKey);

    if (!value) {
      throw new ServiceUnavailableException(
        `${sharedKey} or ${providerKey} is not configured`,
      );
    }

    return value;
  }

  private getProviderName(provider: LlmProvider): string {
    return provider === 'openai' ? 'OpenAI' : 'DeepSeek';
  }

  private getFirstConfigValue(...keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.configService.get<string>(key)?.trim();

      if (value) {
        return value;
      }
    }

    return undefined;
  }

  private validateTenderShortTitles(value: unknown): TenderShortTitleResult[] {
    if (!isRecord(value) || !Array.isArray(value.items)) {
      throw new Error(
        `${this.providerName} short title response must contain items array`,
      );
    }

    return value.items.map((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') {
        throw new Error(
          `${this.providerName} short title item must contain string id`,
        );
      }

      const shortTitle = {
        en: this.requireShortTitleString(item.en, 'en'),
        de: this.requireShortTitleString(item.de, 'de'),
        fr: this.requireShortTitleString(item.fr, 'fr'),
        pl: this.requireShortTitleString(item.pl, 'pl'),
        ru: this.requireShortTitleString(item.ru, 'ru'),
      };

      return {
        id: item.id,
        shortTitle,
      };
    });
  }

  private requireShortTitleString(value: unknown, language: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(
        `${this.providerName} short title ${language} must be a non-empty string`,
      );
    }

    return value.trim();
  }
}
