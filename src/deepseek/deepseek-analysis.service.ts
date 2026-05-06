import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseLlmAnalysisService } from '@/llm/base-llm-analysis.service';

@Injectable()
export class DeepSeekAnalysisService extends BaseLlmAnalysisService {
  private readonly client: OpenAI;
  private readonly generalAnalysisModel: string;
  private readonly deepAnalysisModel: string;

  constructor(private readonly configService: ConfigService) {
    super('DeepSeek', new Logger(DeepSeekAnalysisService.name));

    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'DEEPSEEK_API_KEY is not configured',
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
    this.generalAnalysisModel =
      this.configService.get<string>('DEEPSEEK_GENERAL_ANALYSIS_MODEL') ??
      'deepseek-chat';
    this.deepAnalysisModel =
      this.configService.get<string>('DEEPSEEK_DEEP_ANALYSIS_MODEL') ??
      this.generalAnalysisModel;
  }

  getGeneralAnalysisModel(): string {
    return this.generalAnalysisModel;
  }

  getDeepAnalysisModel(): string {
    return this.deepAnalysisModel;
  }

  protected async createProviderJsonResponse(
    prompt: string,
    context: string,
    purpose: 'general' | 'deep',
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model:
        purpose === 'deep' ? this.deepAnalysisModel : this.generalAnalysisModel,
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
      throw new Error('DeepSeek response did not contain message content');
    }

    return responseText;
  }
}
