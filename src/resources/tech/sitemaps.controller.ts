import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiDefaultResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TechService } from './tech.service';

@ApiTags('Sitemaps')
@Controller('/sitemaps')
export class SitemapsController {
  constructor(private readonly techService: TechService) {}

  @ApiDefaultResponse({ description: 'Public generated sitemap file.' })
  @Header('Content-Type', 'application/xml')
  @Get(':filename')
  downloadSitemapFile(@Param('filename') filename: string, @Res() res: Response) {
    const outputPath = this.techService.getSitemapDownloadPath(filename);

    return res.download(outputPath, filename);
  }
}
