import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
  GeneralTenderAnalysisInput,
  GeneralTenderAnalysisResult,
} from '@/openai/dto/openai-analysis.dto';
import { DeepSeekAnalysisService } from '@/deepseek/deepseek-analysis.service';
import { TenderGeneralAnalysisService } from '@/resources/tender-analysis/tender-general-analysis.service';
import { devLog } from '@/utils';
import { TenderDocument } from '../tenders/schemas';

export interface TenderAnalysisExecutionResult {
  result: GeneralTenderAnalysisResult;
  promptVersion: string;
  model: string;
}

@Injectable()
export class TenderAnalysisService {
  constructor(
    private readonly deepSeekAnalysisService: DeepSeekAnalysisService,
    @Inject(forwardRef(() => TenderGeneralAnalysisService))
    private readonly tenderGeneralAnalysisService: TenderGeneralAnalysisService,
  ) {}

  getBaseAnalysisSourceHash(tender: TenderDocument): string {
    return this.tenderGeneralAnalysisService.buildGeneralTenderAnalysisSourceHash(
      tender,
      'deepseek',
      this.deepSeekAnalysisService.getGeneralAnalysisModel(),
    );
  }

  async analyzeTenderGeneral(
    input: GeneralTenderAnalysisInput,
  ): Promise<TenderAnalysisExecutionResult> {
    const result =
      await this.deepSeekAnalysisService.analyzeTenderGeneral(input);

    devLog(
      `General tender analysis completed: tender=${input.tender.id}`,
      TenderAnalysisService.name,
    );

    return {
      result,
      promptVersion: GENERAL_TENDER_ANALYSIS_PROMPT_VERSION,
      model: this.deepSeekAnalysisService.getGeneralAnalysisModel(),
    };
  }
}
