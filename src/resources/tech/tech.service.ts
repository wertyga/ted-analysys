import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, isAbsolute, join, normalize } from 'path';
import { TenderModel } from '@/resources/tenders/schemas';

type SitemapTender = {
  id?: string;
  publicationNumber?: string;
  updatedAt?: Date;
};

@Injectable()
export class TechService {
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
    const urls = tenders.flatMap((tender) =>
      this.buildTenderSitemapUrls(domain, locales, tender),
    );
    const xml = this.buildSitemapXml(urls);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, xml, 'utf8');

    return {
      outputPath,
      downloadUrl: '/adm/tech/sitemap/download',
      tendersCount: tenders.length,
      urlsCount: urls.length,
      domain,
      locales,
    };
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

  private getSitemapLocales(localesInput?: string | string[]) {
    const rawLocales = Array.isArray(localesInput)
      ? localesInput.join(',')
      : localesInput || process.env.SITEMAP_LOCALES || 'en';
    const locales = rawLocales
      .split(',')
      .map((locale) => locale.trim().replace(/^\/+|\/+$/g, ''))
      .filter(Boolean);

    return locales.length > 0 ? locales : ['en'];
  }

  getSitemapOutputPath() {
    const configuredPath =
      process.env.SITEMAP_OUTPUT_PATH || 'sitemaps/tenders-sitemap.xml';

    if (isAbsolute(configuredPath)) {
      return normalize(configuredPath);
    }

    return join(process.cwd(), configuredPath);
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
