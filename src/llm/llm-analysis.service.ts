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

type LlmProvider = 'deepseek' | 'openai' | 'kimi' | 'aigate';
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

    const provider = this.resolveProvider();

    this.generalConnection = this.createConnection(
      'general',
      provider,
      'GENERAL_ANALYSIS_MODEL',
    );
    this.deepConnection = this.createConnection(
      'deep',
      provider,
      'DEEP_ANALYSIS_MODEL',
    );
  }

  private resolveProvider(): LlmProvider {
    const provider =
      this.getFirstConfigValue('LLM_PROVIDER')?.toLowerCase() ?? 'deepseek';

    if (
      provider === 'deepseek' ||
      provider === 'openai' ||
      provider === 'kimi' ||
      provider === 'aigate'
    ) {
      return provider;
    }

    throw new ServiceUnavailableException(
      `Unsupported LLM provider "${provider}". Use "deepseek", "openai", "kimi", or "aigate".`,
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
    const response =
      await this.generalConnection.client.chat.completions.create({
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
        ...this.getChatCompletionOptions(this.generalConnection),
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
      ...this.getChatCompletionOptions(connection),
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

  private getChatCompletionOptions(connection: LlmProviderConnection) {
    if (connection.provider === 'aigate') {
      return {};
    }

    if (connection.provider === 'openai') {
      // OpenAI's newer models (e.g. gpt-5.x) only support the default
      // temperature (1) and reject any other explicit value.
      return {
        response_format: { type: 'json_object' } as const,
      };
    }

    return {
      response_format: { type: 'json_object' } as const,
      temperature: 0.1,
    };
  }

  private createConnection(
    purpose: LlmAnalysisPurpose,
    provider: LlmProvider,
    modelKey: string,
  ): LlmProviderConnection {
    return {
      client: new OpenAI({
        apiKey: this.getApiKey(),
        baseURL: this.getBaseUrl(provider),
      }),
      model: this.getModelConfig(provider, modelKey),
      provider,
      providerName: this.getProviderName(provider),
    };
  }

  private getConnection(purpose: LlmAnalysisPurpose): LlmProviderConnection {
    return purpose === 'deep' ? this.deepConnection : this.generalConnection;
  }

  private getApiKey(): string {
    const apiKey = this.getFirstConfigValue('LLM_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'LLM API key is not configured. Set LLM_API_KEY.',
      );
    }

    return apiKey;
  }

  private getBaseUrl(provider: LlmProvider): string | undefined {
    const providerPrefix = this.getProviderEnvPrefix(provider);
    const providerBaseUrlFallbacks =
      provider === 'kimi' ? ['MOONSHOT_BASE_URL', 'MOONSHOT_API_BASE_URL'] : [];
    const baseUrl = this.getFirstConfigValue(
      'LLM_BASE_URL',
      `${providerPrefix}_BASE_URL`,
      `${providerPrefix}_API_BASE_URL`,
      ...providerBaseUrlFallbacks,
    );

    if (baseUrl) {
      return baseUrl;
    }

    if (provider === 'deepseek') {
      return 'https://api.deepseek.com';
    }

    if (provider === 'kimi') {
      return 'https://api.moonshot.ai/v1';
    }

    if (provider === 'aigate') {
      return 'https://api.aigate.shop/v1';
    }

    return undefined;
  }

  private getModelConfig(provider: LlmProvider, modelKey: string): string {
    const providerPrefix = this.getProviderEnvPrefix(provider);
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
    if (provider === 'openai') {
      return 'OpenAI';
    }

    if (provider === 'kimi') {
      return 'Kimi';
    }

    if (provider === 'aigate') {
      return 'AIGate';
    }

    return 'DeepSeek';
  }

  private getProviderEnvPrefix(provider: LlmProvider): string {
    if (provider === 'openai') {
      return 'OPENAI';
    }

    if (provider === 'kimi') {
      return 'KIMI';
    }

    if (provider === 'aigate') {
      return 'AIGATE';
    }

    return 'DEEPSEEK';
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
