import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@/guards';
import { CompanyProfileWebsiteService } from './company-profile-website.service';
import { ExtractCompanyProfileFromWebsiteDto } from './company-profile-website.dto';

@ApiTags('company-profile-website')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('company-profile-website')
export class CompanyProfileWebsiteController {
  constructor(
    private readonly companyProfileWebsiteService: CompanyProfileWebsiteService,
  ) {}

  @Get('usage')
  @ApiOperation({
    summary:
      'How many website extractions the user has left (unlimited with Pro)',
  })
  @ApiOkResponse({
    description:
      '{ unlimited: boolean, freeLimit: number, remaining: number | null }',
  })
  async getUsage(@Req() req) {
    return this.companyProfileWebsiteService.getUsage(req.user);
  }

  @Post('extract')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Read the company website and extract company profile fields for review (nothing is saved). One free extraction per user, unlimited with Pro.',
  })
  @ApiBody({ type: ExtractCompanyProfileFromWebsiteDto })
  @ApiOkResponse({ description: 'Extracted company profile fields' })
  @ApiForbiddenResponse({
    description:
      'code COMPANY_WEBSITE_EXTRACTION_LIMIT_REACHED: the free extraction is used up',
  })
  async extractCompanyProfile(
    @Body() body: ExtractCompanyProfileFromWebsiteDto,
    @Req() req,
  ) {
    return this.companyProfileWebsiteService.extractProfile(body.url, req.user);
  }
}
