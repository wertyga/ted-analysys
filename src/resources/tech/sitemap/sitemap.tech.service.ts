import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import CPV_INDUSTRY_SLUGS from './cpv-slug.json';
import COUNTRY_SLUGS from './countries-slug.json';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
} from 'path';
import { TenderModel } from '@/resources/tenders/schemas';

type SitemapTender = {
  id?: string;
  publicationNumber?: string;
  updatedAt?: Date;
};

const SITEMAP_MAX_URLS = 40_000;

@Injectable()
export class SitemapTechService {
  async generateTenderSitemap(options: {
    domain: string;
    locales?: string | string[];
  }) {
    const domain = this.normalizeSitemapDomain(options.domain);
    const locales = this.getSitemapLocales(options.locales);
    const outputPath = this.getSitemapOutputPath();
    const tenders = await TenderModel.find({})
      .select('id publicationNumber updatedAt')
      .lean<SitemapTender[]>()
      .exec();
    const tenderUrls = tenders.flatMap((tender) =>
      this.buildTenderSitemapUrls(domain, locales, tender),
    );
    const industryUrls = this.buildCpvIndustrySitemapUrls(domain, locales);
    const countryUrls = this.buildCountrySitemapUrls(domain, locales);
    const urls = [...tenderUrls, ...industryUrls, ...countryUrls];
    const sitemapFiles = this.buildSitemapFiles(outputPath, urls);

    await mkdir(dirname(outputPath), { recursive: true });

    if (sitemapFiles.length === 1) {
      await writeFile(outputPath, this.buildSitemapXml(urls), 'utf8');
    } else {
      await Promise.all(
        sitemapFiles.map((file) =>
          writeFile(file.outputPath, file.xml, 'utf8'),
        ),
      );
      await writeFile(
        outputPath,
        this.buildSitemapIndexXml(
          sitemapFiles.map((file) => ({
            loc: this.buildPublicSitemapUrl(domain, file.outputPath),
            lastmod: new Date().toISOString(),
          })),
        ),
        'utf8',
      );
    }

    return {
      outputPath,
      downloadUrl: '/adm/tech/sitemap/download',
      tendersCount: tenders.length,
      industriesCount: CPV_INDUSTRY_SLUGS.length,
      countriesCount: COUNTRY_SLUGS.length,
      urlsCount: urls.length,
      sitemapFilesCount: sitemapFiles.length,
      sitemapFiles: sitemapFiles.map((file) => ({
        filename: basename(file.outputPath),
        outputPath: file.outputPath,
        downloadUrl: `/adm/tech/sitemap/download?file=${encodeURIComponent(
          basename(file.outputPath),
        )}`,
      })),
      isSitemapIndex: sitemapFiles.length > 1,
      domain,
      locales,
    };
  }

  getSitemapOutputPath() {
    const configuredPath = 'sitemaps/tenders-sitemap.xml';

    if (isAbsolute(configuredPath)) {
      return normalize(configuredPath);
    }

    return join(process.cwd(), configuredPath);
  }

  getSitemapDownloadPath(filename?: string) {
    const outputPath = this.getSitemapOutputPath();

    if (!filename) {
      return outputPath;
    }

    if (filename !== basename(filename) || !/^[\w.-]+\.xml$/i.test(filename)) {
      throw new BadRequestException('Invalid sitemap filename.');
    }

    const downloadPath = normalize(join(dirname(outputPath), filename));

    if (!existsSync(downloadPath)) {
      throw new NotFoundException('Sitemap file was not found.');
    }

    return downloadPath;
  }

  private buildTenderSitemapUrls(
    domain: string,
    locales: string[],
    tender: SitemapTender,
  ) {
    const tenderId = tender.publicationNumber || tender.id;

    if (!tenderId) {
      return [];
    }

    return locales.map((locale) => ({
      loc: `${domain}/${locale}/tenders/${encodeURIComponent(tenderId)}`,
      lastmod: tender.updatedAt?.toISOString(),
    }));
  }

  private buildCpvIndustrySitemapUrls(domain: string, locales: string[]) {
    return locales.flatMap((locale) =>
      CPV_INDUSTRY_SLUGS.map((slug) => ({
        loc: `${domain}/${locale}/industries/${encodeURIComponent(slug)}`,
      })),
    );
  }

  private buildCountrySitemapUrls(domain: string, locales: string[]) {
    return locales.flatMap((locale) =>
      COUNTRY_SLUGS.map((country) => ({
        loc: `${domain}/${locale}/tenders/${encodeURIComponent(country)}`,
      })),
    );
  }

  private buildSitemapXml(urls: Array<{ loc: string; lastmod?: string }>) {
    const urlEntries = urls
      .map((url) => {
        const lastmod = url.lastmod
          ? `\n    <lastmod>${this.escapeXml(url.lastmod)}</lastmod>`
          : '';

        return `  <url>\n    <loc>${this.escapeXml(url.loc)}</loc>${lastmod}\n  </url>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
  }

  private buildSitemapIndexXml(
    sitemaps: Array<{ loc: string; lastmod?: string }>,
  ) {
    const sitemapEntries = sitemaps
      .map((sitemap) => {
        const lastmod = sitemap.lastmod
          ? `\n    <lastmod>${this.escapeXml(sitemap.lastmod)}</lastmod>`
          : '';

        return `  <sitemap>\n    <loc>${this.escapeXml(sitemap.loc)}</loc>${lastmod}\n  </sitemap>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</sitemapindex>\n`;
  }

  private buildSitemapFiles(
    outputPath: string,
    urls: Array<{ loc: string; lastmod?: string }>,
  ) {
    if (urls.length <= SITEMAP_MAX_URLS) {
      return [
        {
          outputPath,
          xml: this.buildSitemapXml(urls),
        },
      ];
    }

    const parsedOutputPath = parse(outputPath);
    const chunks: Array<{ outputPath: string; xml: string }> = [];

    for (let index = 0; index < urls.length; index += SITEMAP_MAX_URLS) {
      const chunkUrls = urls.slice(index, index + SITEMAP_MAX_URLS);
      const chunkNumber = chunks.length + 1;
      const chunkOutputPath = join(
        parsedOutputPath.dir,
        `${parsedOutputPath.name}-${chunkNumber}${parsedOutputPath.ext}`,
      );

      chunks.push({
        outputPath: chunkOutputPath,
        xml: this.buildSitemapXml(chunkUrls),
      });
    }

    return chunks;
  }

  private buildPublicSitemapUrl(domain: string, sitemapPath: string) {
    const relativePath = relative(process.cwd(), sitemapPath);
    const publicPath =
      relativePath &&
      !relativePath.startsWith('..') &&
      !isAbsolute(relativePath)
        ? relativePath
        : basename(sitemapPath);

    return `${domain}/${publicPath.replace(/\\/g, '/')}`;
  }

  private getSitemapLocales(localesInput?: string | string[]) {
    const rawLocales = Array.isArray(localesInput)
      ? localesInput.join(',')
      : localesInput || 'en';
    const locales = rawLocales
      .split(',')
      .map((locale) => locale.trim().replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);

    return locales.length > 0 ? locales : ['en'];
  }

  private trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, '');
  }

  private normalizeSitemapDomain(domain: string) {
    const normalizedDomain = this.trimTrailingSlash(domain.trim());

    try {
      const url = new URL(normalizedDomain);

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Unsupported protocol');
      }

      return url.toString().replace(/\/+$/, '');
    } catch {
      throw new BadRequestException(
        'Sitemap domain must be a valid http or https URL.',
      );
    }
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
