import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminAccessGuard } from '@/guards';
import { SitemapTechService } from './sitemap.tech.service';
import { GenerateTenderSitemapRequestDto } from './sitemap.tech.dto';

@ApiTags('Admin Tech Sitemap')
@ApiBearerAuth()
@Controller('/adm/tech/sitemap')
@UseGuards(AdminAccessGuard)
export class SitemapTechController {
  constructor(private readonly sitemapTechService: SitemapTechService) {}

  @ApiDefaultResponse({ description: 'Generated tender sitemap file.' })
  @Get('/')
  generateTenderSitemapByGet(@Query() query: GenerateTenderSitemapRequestDto) {
    return this.sitemapTechService.generateTenderSitemap({
      domain: query.domain,
      locales: query.locales,
      maxUrlsPerFile: query.maxUrlsPerFile,
    });
  }

  @ApiDefaultResponse({ description: 'Generated tender sitemap file.' })
  @Post('/')
  generateTenderSitemapByPost(@Body() body: GenerateTenderSitemapRequestDto) {
    return this.sitemapTechService.generateTenderSitemap({
      domain: body.domain,
      locales: body?.locales,
      maxUrlsPerFile: body.maxUrlsPerFile,
    });
  }

  @ApiDefaultResponse({ description: 'Download generated tender sitemap.' })
  @Header('Content-Type', 'application/xml')
  @Get('/download')
  async downloadTenderSitemap(
    @Query('file') file: string | undefined,
    @Res() res: Response,
  ) {
    const outputPath = this.sitemapTechService.getSitemapDownloadPath(file);

    return res.download(outputPath, file || 'tenders-sitemap.xml');
  }

  @ApiDefaultResponse({ description: 'Public generated sitemap file.' })
  @Header('Content-Type', 'application/xml')
  @Get(':filename')
  downloadSitemapFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const outputPath = this.sitemapTechService.getSitemapDownloadPath(filename);

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    );

    return res.sendFile(outputPath);
  }
}
