import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CodelistCountryOption,
  CodelistService,
} from './codelist.service';
import type {
  BuyerLegalTypeOption,
  BuyerMainActivityOption,
  CurrencyOption,
  LanguageOption,
} from '@/resources/codelist';

@ApiTags('codelist')
@Controller('codelist')
export class CodelistController {
  constructor(private readonly codelistService: CodelistService) {}

  @Get('countries')
  @ApiOperation({ summary: 'Get TED eligible countries for frontend filters' })
  @ApiOkResponse({ description: 'List of TED country codes and names' })
  getCountries(): CodelistCountryOption[] {
    return this.codelistService.getCountries();
  }

  @Get('currencies')
  @ApiOperation({ summary: 'Get TED currencies for frontend filters' })
  @ApiOkResponse({ description: 'List of TED currency codes and names' })
  getCurrencies(): CurrencyOption[] {
    return this.codelistService.getCurrencies();
  }

  @Get('buyer-legal-types')
  @ApiOperation({
    summary: 'Get TED buyer legal type codelist for frontend filters',
  })
  @ApiOkResponse({
    description: 'Tree of TED buyer legal type codes and names',
  })
  getBuyerLegalTypes(): BuyerLegalTypeOption[] {
    return this.codelistService.getBuyerLegalTypes();
  }

  @Get('buyer-main-activities')
  @ApiOperation({
    summary: 'Get TED buyer main activity codelist for frontend filters',
  })
  @ApiOkResponse({
    description: 'List of TED buyer main activity codes and names',
  })
  getBuyerMainActivities(): BuyerMainActivityOption[] {
    return this.codelistService.getBuyerMainActivities();
  }

  @Get('languages')
  @ApiOperation({ summary: 'Get TED language codelist for frontend filters' })
  @ApiOkResponse({ description: 'Tree of TED language codes and names' })
  getLanguages(): LanguageOption[] {
    return this.codelistService.getLanguages();
  }
}
