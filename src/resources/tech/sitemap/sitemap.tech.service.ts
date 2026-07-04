import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import CPV_INDUSTRIES from './cpv-obj.json';
import { STATIC_SITEMAP_PATHS } from './static-pages';
import { COUNTRY_DATA, EUROPEAN_CODES } from './countries';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { basename, dirname, isAbsolute, join, normalize, relative } from 'path';
import { TenderModel } from '@/resources/tenders/schemas';
import { BuyerModel } from '@/resources/buyer/schemas';
import { ContractorModel } from '@/resources/contractor/schemas';

type SitemapTender = {
  id?: string;
  updatedAt?: Date;
};

type SitemapBuyer = {
  _id?: unknown;
  updatedAt?: Date;
};

type SitemapContractor = {
  _id?: unknown;
  updatedAt?: Date;
};

type SitemapUrl = {
  loc: string;
  lastmod?: string;
  priority?: number;
};

type WrittenSitemapFile = {
  filename: string;
  outputPath: string;
  loc: string;
  count: number;
};

const SITEMAP_ABSOLUTE_MAX_URLS = 40_000;

@Injectable()
export class SitemapTechService {
  async generateTenderSitemap(options: {
    domain: string;
    locales?: string | string[];
    maxUrlsPerFile?: number;
  }) {
    const domain = this.normalizeSitemapDomain(options.domain);
    const locales = this.getSitemapLocales(options.locales);
    const maxUrlsPerFile = this.normalizeMaxUrlsPerFile(options.maxUrlsPerFile);
    const outputPath = this.getSitemapOutputPath();
    const outputDir = dirname(outputPath);

    await mkdir(outputDir, { recursive: true });

    const sitemapFiles: WrittenSitemapFile[] = [];

    const staticResult = await this.writeSitemapEntityFiles({
      domain,
      outputDir,
      entityName: 'static',
      urls: this.buildStaticSitemapUrls(domain, locales),
      maxUrlsPerFile,
    });
    sitemapFiles.push(...staticResult.files);

    const tenderResult = await this.writeTenderSitemapFiles({
      domain,
      locales,
      outputDir,
      maxUrlsPerFile,
    });
    sitemapFiles.push(...tenderResult.files);

    const buyersResult = await this.writeBuyerSitemapFiles({
      domain,
      locales,
      outputDir,
      maxUrlsPerFile,
    });
    sitemapFiles.push(...buyersResult.files);

    const contractorsResult = await this.writeContractorSitemapFiles({
      domain,
      locales,
      outputDir,
      maxUrlsPerFile,
    });
    sitemapFiles.push(...contractorsResult.files);

    const industryResult = await this.writeSitemapEntityFiles({
      domain,
      outputDir,
      entityName: 'industries',
      urls: await this.buildCpvIndustrySitemapUrls(domain),
      maxUrlsPerFile,
    });
    sitemapFiles.push(...industryResult.files);

    const countryResult = await this.writeSitemapEntityFiles({
      domain,
      outputDir,
      entityName: 'countries',
      urls: await this.buildCountrySitemapUrls(domain, locales),
      maxUrlsPerFile,
    });
    sitemapFiles.push(...countryResult.files);

    const countryIndustryResult = await this.writeSitemapEntityFiles({
      domain,
      outputDir,
      entityName: 'country-industries',
      urls: await this.buildCountryIndustrySitemapUrls(domain, locales),
      maxUrlsPerFile,
    });
    sitemapFiles.push(...countryIndustryResult.files);

    await writeFile(
      outputPath,
      this.buildSitemapIndexXml(
        sitemapFiles.map((file) => ({
          loc: file.loc,
          lastmod: new Date().toISOString(),
        })),
      ),
      'utf8',
    );

    const urlsCount =
      staticResult.count +
      tenderResult.count +
      buyersResult.count +
      contractorsResult.count +
      industryResult.count +
      countryResult.count +
      countryIndustryResult.count;

    return {
      outputPath,
      downloadUrl: '/adm/tech/sitemap/download',
      staticCount: staticResult.count,
      tendersCount: tenderResult.count,
      buyersCount: buyersResult.count,
      contractorsCount: contractorsResult.count,
      industriesCount: industryResult.count,
      countriesCount: countryResult.count,
      countryIndustriesCount: countryIndustryResult.count,
      urlsCount,
      sitemapFilesCount: sitemapFiles.length,
      maxUrlsPerFile,
      sitemapFiles: sitemapFiles.map((file) => ({
        filename: file.filename,
        outputPath: file.outputPath,
        downloadUrl: `/adm/tech/sitemap/download?file=${encodeURIComponent(
          file.filename,
        )}`,
      })),
      isSitemapIndex: true,
      domain,
      locales,
    };
  }

  private async writeTenderSitemapFiles(options: {
    domain: string;
    locales: string[];
    outputDir: string;
    maxUrlsPerFile: number;
  }) {
    const { domain, locales, outputDir, maxUrlsPerFile } = options;

    const files: WrittenSitemapFile[] = [];
    let buffer: SitemapUrl[] = [];
    let totalCount = 0;

    const flush = async () => {
      if (!buffer.length) return;

      const fileIndex = files.length;
      const outputPath = join(outputDir, `tenders-${fileIndex}.xml`);
      const chunk = buffer;

      buffer = [];

      await writeFile(outputPath, this.buildSitemapXml(chunk), 'utf8');

      files.push({
        filename: basename(outputPath),
        outputPath,
        loc: this.buildPublicSitemapUrl(domain, outputPath),
        count: chunk.length,
      });
    };

    const cursor = TenderModel.find({
      id: { $exists: true, $ne: null },
    })
      .select('id updatedAt')
      .lean<SitemapTender>()
      .cursor();

    for await (const tender of cursor) {
      if (!tender.id) continue;

      for (const locale of locales) {
        buffer.push({
          loc: `${domain}/${locale}/tenders/${encodeURIComponent(tender.id)}`,
          lastmod: tender.updatedAt?.toISOString(),
        });

        totalCount++;

        if (buffer.length >= maxUrlsPerFile) {
          await flush();
        }
      }
    }

    await flush();

    return {
      count: totalCount,
      files,
    };
  }

  private async writeSitemapEntityFiles(options: {
    domain: string;
    outputDir: string;
    entityName: string;
    urls: SitemapUrl[];
    maxUrlsPerFile: number;
  }) {
    const { domain, outputDir, entityName, urls, maxUrlsPerFile } = options;
    const files: WrittenSitemapFile[] = [];

    for (let index = 0; index < urls.length; index += maxUrlsPerFile) {
      const chunk = urls.slice(index, index + maxUrlsPerFile);
      const fileIndex = files.length;
      const outputPath = join(outputDir, `${entityName}-${fileIndex}.xml`);

      await writeFile(outputPath, this.buildSitemapXml(chunk), 'utf8');

      files.push({
        filename: basename(outputPath),
        outputPath,
        loc: this.buildPublicSitemapUrl(domain, outputPath),
        count: chunk.length,
      });
    }

    return {
      count: urls.length,
      files,
    };
  }

  private async writeBuyerSitemapFiles(options: {
    domain: string;
    locales: string[];
    outputDir: string;
    maxUrlsPerFile: number;
  }) {
    const { domain, locales, outputDir, maxUrlsPerFile } = options;

    const files: WrittenSitemapFile[] = [];
    let buffer: SitemapUrl[] = [];
    let totalCount = 0;

    const flush = async () => {
      if (!buffer.length) return;

      const fileIndex = files.length;
      const outputPath = join(outputDir, `buyers-${fileIndex}.xml`);
      const chunk = buffer;

      buffer = [];

      await writeFile(outputPath, this.buildSitemapXml(chunk), 'utf8');

      files.push({
        filename: basename(outputPath),
        outputPath,
        loc: this.buildPublicSitemapUrl(domain, outputPath),
        count: chunk.length,
      });
    };

    for (const locale of locales) {
      buffer.push({
        loc: `${domain}/${locale}/buyers`,
        priority: 0.8,
      });
      totalCount++;

      if (buffer.length >= maxUrlsPerFile) {
        await flush();
      }
    }

    const cursor = BuyerModel.find({})
      .select('_id updatedAt')
      .lean<SitemapBuyer>()
      .cursor();

    for await (const buyer of cursor) {
      const buyerId = buyer._id ? String(buyer._id) : '';

      if (!buyerId) continue;

      for (const locale of locales) {
        buffer.push({
          loc: `${domain}/${locale}/buyers/${encodeURIComponent(buyerId)}`,
          lastmod: buyer.updatedAt?.toISOString(),
        });

        totalCount++;

        if (buffer.length >= maxUrlsPerFile) {
          await flush();
        }
      }
    }

    await flush();

    return {
      count: totalCount,
      files,
    };
  }

  private async writeContractorSitemapFiles(options: {
    domain: string;
    locales: string[];
    outputDir: string;
    maxUrlsPerFile: number;
  }) {
    const { domain, locales, outputDir, maxUrlsPerFile } = options;

    const files: WrittenSitemapFile[] = [];
    let buffer: SitemapUrl[] = [];
    let totalCount = 0;

    const flush = async () => {
      if (!buffer.length) return;

      const fileIndex = files.length;
      const outputPath = join(outputDir, `contractors-${fileIndex}.xml`);
      const chunk = buffer;

      buffer = [];

      await writeFile(outputPath, this.buildSitemapXml(chunk), 'utf8');

      files.push({
        filename: basename(outputPath),
        outputPath,
        loc: this.buildPublicSitemapUrl(domain, outputPath),
        count: chunk.length,
      });
    };

    for (const locale of locales) {
      buffer.push({
        loc: `${domain}/${locale}/contractors`,
        priority: 0.8,
      });
      totalCount++;

      if (buffer.length >= maxUrlsPerFile) {
        await flush();
      }
    }

    const cursor = ContractorModel.find({})
      .select('_id updatedAt')
      .lean<SitemapContractor>()
      .cursor();

    for await (const contractor of cursor) {
      const contractorId = contractor._id ? String(contractor._id) : '';

      if (!contractorId) continue;

      for (const locale of locales) {
        buffer.push({
          loc: `${domain}/${locale}/contractors/${encodeURIComponent(
            contractorId,
          )}`,
          lastmod: contractor.updatedAt?.toISOString(),
        });

        totalCount++;

        if (buffer.length >= maxUrlsPerFile) {
          await flush();
        }
      }
    }

    await flush();

    return {
      count: totalCount,
      files,
    };
  }

  private buildStaticSitemapUrls(
    domain: string,
    locales: string[],
  ): SitemapUrl[] {
    return locales.flatMap((locale) =>
      STATIC_SITEMAP_PATHS.map((page) => ({
        loc: page.path
          ? `${domain}/${locale}/${page.path}`
          : `${domain}/${locale}`,
        priority: page.priority,
      })),
    );
  }

  getSitemapOutputPath() {
    const configuredPath = 'sitemaps/sitemap.xml';

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

  private async buildCpvIndustrySitemapUrls(
    domain: string,
  ): Promise<SitemapUrl[]> {
    const cursor = TenderModel.find({
      'cpvCodes.0': { $exists: true },
    })
      .select('cpvCodes')
      .lean<{ cpvCodes?: string[] }>()
      .cursor();

    const industryCodeSet = new Set<string>();

    for await (const tender of cursor) {
      for (const cpvCode of tender.cpvCodes || []) {
        for (const indexableCpvCode of this.getIndexableCpvIndustryCodes(
          cpvCode,
        )) {
          industryCodeSet.add(indexableCpvCode);
        }
      }
    }

    return Array.from(industryCodeSet)
      .map((code) => CPV_INDUSTRIES[code])
      .filter((industry) => industry?.slug)
      .map((industry) => ({
        loc: `${domain}/en/industries/${encodeURIComponent(industry.slug)}`,
      }));
  }

  private async buildCountrySitemapUrls(
    domain: string,
    locales: string[],
  ): Promise<SitemapUrl[]> {
    const countryCodeSet = new Set<string>();

    for (const countryCode of EUROPEAN_CODES) {
      if (COUNTRY_DATA[countryCode]?.slug) {
        countryCodeSet.add(countryCode);
      }
    }

    const cursor = TenderModel.find({
      'placeOfPerformanceCountries.0': { $exists: true },
    })
      .select('placeOfPerformanceCountries')
      .lean<{ placeOfPerformanceCountries?: string[] }>()
      .cursor();

    for await (const tender of cursor) {
      for (const countryCode of tender.placeOfPerformanceCountries || []) {
        if (COUNTRY_DATA[countryCode]?.slug) {
          countryCodeSet.add(countryCode);
        }
      }
    }

    const urls = new Set<string>();

    for (const locale of locales) {
      for (const countryCode of countryCodeSet) {
        const slug = COUNTRY_DATA[countryCode]?.slug;

        if (!slug) continue;

        urls.add(`${domain}/${locale}/countries/${encodeURIComponent(slug)}`);
      }
    }

    return Array.from(urls).map((loc) => ({ loc }));
  }

  private async buildCountryIndustrySitemapUrls(
    domain: string,
    locales: string[],
  ): Promise<SitemapUrl[]> {
    const cursor = TenderModel.find({
      'placeOfPerformanceCountries.0': { $exists: true },
      'cpvCodes.0': { $exists: true },
    })
      .select('placeOfPerformanceCountries cpvCodes')
      .lean<{
        placeOfPerformanceCountries?: string[];
        cpvCodes?: string[];
      }>()
      .cursor();

    const urlSet = new Set<string>();

    for await (const tender of cursor) {
      const countries = tender.placeOfPerformanceCountries || [];
      const cpvCodes = tender.cpvCodes || [];

      for (const countryCode of countries) {
        const countrySlug = COUNTRY_DATA[countryCode]?.slug;

        if (!countrySlug) continue;

        for (const cpvCode of cpvCodes) {
          for (const indexableCpvCode of this.getIndexableCpvIndustryCodes(
            cpvCode,
          )) {
            const industry = CPV_INDUSTRIES[indexableCpvCode];

            if (!industry?.slug) continue;

            for (const locale of locales) {
              urlSet.add(
                `${domain}/${locale}/${encodeURIComponent(
                  countrySlug,
                )}/${encodeURIComponent(industry.slug)}`,
              );
            }
          }
        }
      }
    }

    return Array.from(urlSet).map((loc) => ({ loc }));
  }

  private getIndexableCpvIndustryCodes(cpvCode: string) {
    const normalized = String(cpvCode || '').trim();

    if (!/^\d{8}$/.test(normalized)) {
      return [];
    }

    const candidates = [
      normalized.slice(0, 2) + '000000',
      normalized.slice(0, 3) + '00000',
      normalized.slice(0, 4) + '0000',
    ];

    return Array.from(new Set(candidates)).filter((code) => {
      const industry = CPV_INDUSTRIES[code];

      return industry?.slug && industry.level >= 2 && industry.level <= 4;
    });
  }

  private buildSitemapXml(urls: SitemapUrl[]) {
    const urlEntries = urls
      .map((url) => {
        const lastmod = url.lastmod
          ? `\n    <lastmod>${this.escapeXml(url.lastmod)}</lastmod>`
          : '';

        const priority =
          typeof url.priority === 'number'
            ? `\n    <priority>${url.priority.toFixed(1)}</priority>`
            : '';

        return `  <url>\n    <loc>${this.escapeXml(
          url.loc,
        )}</loc>${lastmod}${priority}\n  </url>`;
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

        return `  <sitemap>\n    <loc>${this.escapeXml(
          sitemap.loc,
        )}</loc>${lastmod}\n  </sitemap>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</sitemapindex>\n`;
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

  private normalizeMaxUrlsPerFile(maxUrlsPerFile?: number) {
    if (!maxUrlsPerFile) {
      return SITEMAP_ABSOLUTE_MAX_URLS;
    }

    if (
      !Number.isInteger(maxUrlsPerFile) ||
      maxUrlsPerFile < 1 ||
      maxUrlsPerFile > SITEMAP_ABSOLUTE_MAX_URLS
    ) {
      throw new BadRequestException(
        `Sitemap maxUrlsPerFile must be an integer from 1 to ${SITEMAP_ABSOLUTE_MAX_URLS}.`,
      );
    }

    return maxUrlsPerFile;
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
