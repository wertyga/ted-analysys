import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseLlmAnalysisService } from '@/llm/base-llm-analysis.service';
import { GENERAL_TENDER_ANALYSIS_JSON_SCHEMA } from './schemas/general-tender-analysis.schema';

@Injectable()
export class OpenAiService extends BaseLlmAnalysisService {
  private readonly client: OpenAI;
  private readonly generalAnalysisModel: string;

  constructor(private readonly configService: ConfigService) {
    super('OpenAI', new Logger(OpenAiService.name));

    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }

    this.client = new OpenAI({ apiKey });
    this.generalAnalysisModel =
      this.configService.get<string>('OPENAI_GENERAL_ANALYSIS_MODEL') ??
      'gpt-4.1-mini';
  }

  getGeneralAnalysisModel(): string {
    return this.generalAnalysisModel;
  }

  protected async createProviderJsonResponse(
    prompt: string,
    context: string,
  ): Promise<string> {
    const response = await this.client.responses.create({
      model: this.generalAnalysisModel,
      instructions: prompt,
      input: context,
      text: {
        format: {
          type: 'json_schema',
          name: 'general_tender_analysis',
          strict: true,
          schema: GENERAL_TENDER_ANALYSIS_JSON_SCHEMA,
        },
      },
    });

    if (!response.output_text) {
      throw new Error('OpenAI response did not contain output_text');
    }

    return response.output_text;
  }
}
