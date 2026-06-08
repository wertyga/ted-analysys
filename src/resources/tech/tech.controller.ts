import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AdminAccessGuard } from '@/guards';
import { TechService } from './tech.service';

class GenerateTenderSitemapRequestDto {
  @IsString()
  @IsNotEmpty()
  domain!: string;

  @IsOptional()
  locales?: string | string[];
}

@ApiTags('Admin Tech')
@ApiBearerAuth()
@Controller('/adm/tech')
@UseGuards(AdminAccessGuard)
export class TechController {
  constructor(private readonly techService: TechService) {}

  @ApiDefaultResponse({ description: 'Generated tender sitemap file.' })
  @Get('/')
  generateTenderSitemapByGet(@Query() query: GenerateTenderSitemapRequestDto) {
    return this.techService.generateTenderSitemap({
      domain: query.domain,
      locales: query.locales,
    });
  }

  @ApiDefaultResponse({ description: 'Generated tender sitemap file.' })
  @Post('/')
  generateTenderSitemapByPost(@Body() body: GenerateTenderSitemapRequestDto) {
    return this.techService.generateTenderSitemap({
      domain: body.domain,
      locales: body?.locales,
    });
  }

  @ApiDefaultResponse({ description: 'Download generated tender sitemap.' })
  @Header('Content-Type', 'application/xml')
  @Get('/sitemap/download')
  async downloadTenderSitemap(@Res() res: Response) {
    const outputPath = this.techService.getSitemapOutputPath();

    return res.download(outputPath, 'tenders-sitemap.xml');
  }
}
