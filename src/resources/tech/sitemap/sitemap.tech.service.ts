import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import CPV_INDUSTRIES from './cpv-obj.json';
import { STATIC_SITEMAP_PATHS } from './static-pages';
import { COUNTRY_DATA } from './countries';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { basename, dirname, isAbsolute, join, normalize, relative } from 'path';
import { TenderModel } from '@/resources/tenders/schemas';
import { BuyerModel } from '@/resources/buyer/schemas';
import { ContractorModel } from '@/resources/contractor/schemas';
import { AwardTenderModel } from '@/resources/award-tender/schemas';
import { SitePageTemplate } from '@/resources/marketing-task/marketing-task.types';
import {
  getIndexableLocales,
  isIndexableLocaleVersion,
} from '@/resources/marketing-task/marketing-task.utils';
import {
  getCountryCpvKey,
  getIndexableScopes,
  INDEXABLE_CONTRACTOR_FILTER,
} from '@/resources/seo/page-indexability';

type IndexableScopes = Awaited<ReturnType<typeof getIndexableScopes>>;

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

type SitemapAwardTender = {
  id?: string;
  updatedAt?: Date;
};

type SitemapUrl = {
  loc: string;
  lastmod?: string;
};

type WrittenSitemapFile = {
  filename: string;
  outputPath: string;
  loc: string;
  count: number;
};

const SITEMAP_ABSOLUTE_MAX_URLS = 40_000;
// /award-tenders/country/{slug} is noindex below this many awards
const AWARD_COUNTRY_MIN_AWARDS = 10;

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

    const awardTenderResult = await this.writeAwardTenderSitemapFiles({
      domain,
      locales,
      outputDir,
      maxUrlsPerFile,
    });
    sitemapFiles.push(...awardTenderResult.files);

    const awardDirectoryResult = await this.writeSitemapEntityFiles({
      domain,
      outputDir,
      entityName: 'award-directory',
      urls: await this.buildAwardDirectorySitemapUrls(domain, locales),
      maxUrlsPerFile,
    });
    sitemapFiles.push(...awardDirectoryResult.files);

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

    const indexableScopes = await getIndexableScopes();

    const industryResult = await this.writeSitemapEntityFiles({
      domain,
      outputDir,
      entityName: 'industries',
      urls: this.buildCpvIndustrySitemapUrls(domain, locales, indexableScopes),
      maxUrlsPerFile,
    });
    sitemapFiles.push(...industryResult.files);

    const countryResult = await this.writeSitemapEntityFiles({
      domain,
      outputDir,
      entityName: 'countries',
      urls: this.buildCountrySitemapUrls(domain, locales, indexableScopes),
      maxUrlsPerFile,
    });
    sitemapFiles.push(...countryResult.files);

    const countryIndustryResult = await this.writeSitemapEntityFiles({
      domain,
      outputDir,
      entityName: 'country-industries',
      urls: this.buildCountryIndustrySitemapUrls(
        domain,
        locales,
        indexableScopes,
      ),
      maxUrlsPerFile,
    });
    sitemapFiles.push(...countryIndustryResult.files);

    await writeFile(
      outputPath,
      this.buildSitemapIndexXml(
        sitemapFiles.map((file) => ({
          loc: file.loc,
        })),
      ),
      'utf8',
    );

    const urlsCount =
      staticResult.count +
      tenderResult.count +
      awardTenderResult.count +
      awardDirectoryResult.count +
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
      awardTendersCount: awardTenderResult.count,
      awardDirectoryCount: awardDirectoryResult.count,
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

    const tenderLocales = this.getTemplateLocales(
      locales,
      SitePageTemplate.tender,
    );

    if (!tenderLocales.length) {
      return { count: 0, files };
    }

    const cursor = TenderModel.find({
      id: { $exists: true, $ne: null },
    })
      .select('id updatedAt')
      .lean<SitemapTender>()
      .cursor();

    for await (const tender of cursor) {
      if (!tender.id) continue;

      for (const locale of tenderLocales) {
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

  private async writeAwardTenderSitemapFiles(options: {
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
      const outputPath = join(outputDir, `award-tenders-${fileIndex}.xml`);
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

    const awardTenderLocales = this.getTemplateLocales(
      locales,
      SitePageTemplate.award_tender,
    );

    if (!awardTenderLocales.length) {
      return { count: 0, files };
    }

    const cursor = AwardTenderModel.find({
      id: { $exists: true, $ne: null },
    })
      .select('id updatedAt')
      .lean<SitemapAwardTender>()
      .cursor();

    for await (const awardTender of cursor) {
      if (!awardTender.id) continue;

      for (const locale of awardTenderLocales) {
        buffer.push({
          loc: `${domain}/${locale}/award-tenders/${encodeURIComponent(
            awardTender.id,
          )}`,
          lastmod: awardTender.updatedAt?.toISOString(),
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

  private async buildAwardDirectorySitemapUrls(
    domain: string,
    locales: string[],
  ): Promise<SitemapUrl[]> {
    const countryCounts = await AwardTenderModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: { 'placeOfPerformanceCountries.0': { $exists: true } } },
      { $unwind: '$placeOfPerformanceCountries' },
      { $group: { _id: '$placeOfPerformanceCountries', count: { $sum: 1 } } },
      { $match: { count: { $gte: AWARD_COUNTRY_MIN_AWARDS } } },
    ]);

    const countrySlugs = countryCounts
      .map((country) => COUNTRY_DATA[country._id]?.slug)
      .filter(Boolean);

    return this.getTemplateLocales(
      locales,
      SitePageTemplate.award_directory,
    ).flatMap((locale) => [
      { loc: `${domain}/${locale}/award-tenders` },
      { loc: `${domain}/${locale}/award-tenders/country` },
      ...countrySlugs.map((slug) => ({
        loc: `${domain}/${locale}/award-tenders/country/${encodeURIComponent(
          slug,
        )}`,
      })),
    ]);
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

    for (const locale of this.getTemplateLocales(
      locales,
      SitePageTemplate.buyer_list,
    )) {
      buffer.push({
        loc: `${domain}/${locale}/buyers`,
      });
      totalCount++;

      if (buffer.length >= maxUrlsPerFile) {
        await flush();
      }
    }

    const buyerLocales = this.getTemplateLocales(
      locales,
      SitePageTemplate.buyer,
    );

    const cursor = BuyerModel.find({})
      .select('_id updatedAt')
      .lean<SitemapBuyer>()
      .cursor();

    for await (const buyer of cursor) {
      const buyerId = buyer._id ? String(buyer._id) : '';

      if (!buyerId) continue;

      for (const locale of buyerLocales) {
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

    for (const locale of this.getTemplateLocales(
      locales,
      SitePageTemplate.contractor_list,
    )) {
      buffer.push({
        loc: `${domain}/${locale}/contractors`,
      });
      totalCount++;

      if (buffer.length >= maxUrlsPerFile) {
        await flush();
      }
    }

    const contractorLocales = this.getTemplateLocales(
      locales,
      SitePageTemplate.contractor,
    );

    const cursor = ContractorModel.find(INDEXABLE_CONTRACTOR_FILTER)
      .select('_id updatedAt')
      .lean<SitemapContractor>()
      .cursor();

    for await (const contractor of cursor) {
      const contractorId = contractor._id ? String(contractor._id) : '';

      if (!contractorId) continue;

      for (const locale of contractorLocales) {
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
      STATIC_SITEMAP_PATHS.map((page) =>
        page.path ? `/${locale}/${page.path}` : `/${locale}`,
      )
        .filter((path) => isIndexableLocaleVersion(path))
        .map((path) => ({ loc: `${domain}${path}` })),
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

  private buildCpvIndustrySitemapUrls(
    domain: string,
    locales: string[],
    scopes: IndexableScopes,
  ): SitemapUrl[] {
    const industryLocales = this.getTemplateLocales(
      locales,
      SitePageTemplate.industry,
    );

    if (!industryLocales.length) return [];

    const industries = Array.from(scopes.cpvCodes)
      .map((code) => this.getSitemapIndustry(code))
      .filter(Boolean);

    return industryLocales.flatMap((locale) =>
      industries.map((industry) => ({
        loc: `${domain}/${locale}/industries/${encodeURIComponent(
          industry.slug,
        )}`,
      })),
    );
  }

  private buildCountrySitemapUrls(
    domain: string,
    locales: string[],
    scopes: IndexableScopes,
  ): SitemapUrl[] {
    const countryLocales = this.getTemplateLocales(
      locales,
      SitePageTemplate.country,
    );

    if (!countryLocales.length) return [];

    const slugs = Array.from(scopes.countries)
      .map((countryCode) => COUNTRY_DATA[countryCode]?.slug)
      .filter(Boolean);

    return countryLocales.flatMap((locale) =>
      slugs.map((slug) => ({
        loc: `${domain}/${locale}/countries/${encodeURIComponent(slug)}`,
      })),
    );
  }

  private buildCountryIndustrySitemapUrls(
    domain: string,
    locales: string[],
    scopes: IndexableScopes,
  ): SitemapUrl[] {
    const countryIndustryLocales = this.getTemplateLocales(
      locales,
      SitePageTemplate.country_industry,
    );

    if (!countryIndustryLocales.length) return [];

    const urls: SitemapUrl[] = [];

    for (const countryCode of scopes.countries) {
      const countrySlug = COUNTRY_DATA[countryCode]?.slug;

      if (!countrySlug) continue;

      for (const cpvCode of scopes.cpvCodes) {
        if (
          !scopes.countryCpvKeys.has(getCountryCpvKey(countryCode, cpvCode))
        ) {
          continue;
        }

        const industry = this.getSitemapIndustry(cpvCode);

        if (!industry) continue;

        for (const locale of countryIndustryLocales) {
          urls.push({
            loc: `${domain}/${locale}/${encodeURIComponent(
              countrySlug,
            )}/${encodeURIComponent(industry.slug)}`,
          });
        }
      }
    }

    return urls;
  }

  // Requested locales in which the template is indexable, see SITE_BRIEF.md
  private getTemplateLocales(locales: string[], template: SitePageTemplate) {
    const indexableLocales = getIndexableLocales(template);

    return indexableLocales
      ? locales.filter((locale) => indexableLocales.includes(locale))
      : locales;
  }

  // Industry pages listed in the sitemap: CPV levels 2–4 with a slug
  private getSitemapIndustry(cpvCode: string) {
    const industry = CPV_INDUSTRIES[cpvCode];

    return industry?.slug && industry.level >= 2 && industry.level <= 4
      ? industry
      : undefined;
  }

  private buildSitemapXml(urls: SitemapUrl[]) {
    const urlEntries = urls
      .map((url) => {
        const lastmod = url.lastmod
          ? `\n    <lastmod>${this.escapeXml(url.lastmod)}</lastmod>`
          : '';

        return `  <url>\n    <loc>${this.escapeXml(
          url.loc,
        )}</loc>${lastmod}\n  </url>`;
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
