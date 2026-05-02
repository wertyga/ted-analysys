import { Injectable, Logger } from '@nestjs/common';
import {
  GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
  GeneralTenderAnalysisInput,
  GeneralTenderAnalysisResult,
} from '@/openai/dto/openai-analysis.dto';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';

export interface TenderAnalysisExecutionResult {
  result: GeneralTenderAnalysisResult;
  sourceHash: string;
  promptVersion: string;
  model: string;
}

@Injectable()
export class TenderAnalysisService {
  private readonly logger = new Logger(TenderAnalysisService.name);

  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
  ) {}

  async analyzeTenderGeneral(
    input: GeneralTenderAnalysisInput,
  ): Promise<TenderAnalysisExecutionResult> {
    const sourceHash =
      this.deepSeekAnalysisService.buildGeneralTenderAnalysisSourceHash(input);

    const result =
      await this.deepSeekAnalysisService.analyzeTenderGeneral(input);

    this.logger.debug(
      `General tender analysis completed: tender=${input.tender.id} sourceHash=${sourceHash}`,
    );

    return {
      result,
      sourceHash,
      promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
      model: this.deepSeekAnalysisService.getGeneralAnalysisModel(),
    };
  }
}
