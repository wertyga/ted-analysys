import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import {
  GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
  GeneralTenderAnalysisInput,
  GeneralTenderAnalysisResult,
} from '@/openai/dto/openai-analysis.dto';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import { TenderGeneralAnalysisService } from '@/resources/tender-analysis/tender-general-analysis.service';
import { isDev } from '@/utils';

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
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  getBaseAnalysisSourceHash(input: GeneralTenderAnalysisInput): string {
    return this.tenderGeneralAnalysisService.buildGeneralTenderAnalysisSourceHash(
      input,
      'deepseek',
    );
  }

  async analyzeTenderGeneral(
    input: GeneralTenderAnalysisInput,
  ): Promise<TenderAnalysisExecutionResult> {
    const sourceHash = this.getBaseAnalysisSourceHash(input);

    const result =
      await this.deepSeekAnalysisService.analyzeTenderGeneral(input);

    if (isDev) {
      this.logger.debug(
        `General tender analysis completed: tender=${input.tender.id} sourceHash=${sourceHash}`,
      );
    }

    return {
      result,
      sourceHash,
      promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
      model: this.deepSeekAnalysisService.getGeneralAnalysisModel(),
    };
  }
}
