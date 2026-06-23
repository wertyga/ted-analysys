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
import { CpvCategoryModel } from '@/resources/cpv/schemas';

type SitemapTender = {
  id?: string;
  updatedAt?: Date;
};

const SITEMAP_ABSOLUTE_MAX_URLS = 40_000;

@Injectable()
export class SitemapTechService {
  private buildSitemapFilesByEntity(options: {
    outputDir: string;
    entityName: string;
    urls: Array<{ loc: string; lastmod?: string }>;
    maxUrlsPerFile: number;
  }) {
    const { outputDir, entityName, urls, maxUrlsPerFile } = options;

    const chunks: Array<{ outputPath: string; xml: string }> = [];

    for (let index = 0; index < urls.length; index += maxUrlsPerFile) {
      const chunkUrls = urls.slice(index, index + maxUrlsPerFile);
      const chunkIndex = chunks.length;

      chunks.push({
        outputPath: join(outputDir, `${entityName}-${chunkIndex}.xml`),
        xml: this.buildSitemapXml(chunkUrls),
      });
    }

    return chunks;
  }

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

    const tenderUrls = await this.buildTenderSitemapUrls(domain, locales);
    const industryUrls = await this.buildCpvIndustrySitemapUrls(domain);
    const countryUrls = await this.buildCountrySitemapUrls(domain, locales);
    const countryIndustryUrls = await this.buildCountryIndustrySitemapUrls(
      domain,
      locales,
    );
    const staticUrls = this.buildStaticSitemapUrls(domain, locales);

    const sitemapGroups = [
      {
        name: 'static',
        urls: staticUrls,
      },
      {
        name: 'tenders',
        urls: tenderUrls,
      },
      {
        name: 'industries',
        urls: industryUrls,
      },
      {
        name: 'countries',
        urls: countryUrls,
      },
      {
        name: 'country-industries',
        urls: countryIndustryUrls,
      },
    ].filter((group) => group.urls.length > 0);

    const sitemapFiles = sitemapGroups.flatMap((group) =>
      this.buildSitemapFilesByEntity({
        outputDir,
        entityName: group.name,
        urls: group.urls,
        maxUrlsPerFile,
      }),
    );

    const urlsCount = sitemapGroups.reduce(
      (sum, group) => sum + group.urls.length,
      0,
    );

    await mkdir(outputDir, { recursive: true });

    await Promise.all(
      sitemapFiles.map((file) => writeFile(file.outputPath, file.xml, 'utf8')),
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

    return {
      outputPath,
      downloadUrl: '/adm/tech/sitemap/download',
      tendersCount: tenderUrls.length,
      industriesCount: industryUrls.length,
      countriesCount: countryUrls.length,
      countryIndustriesCount: countryIndustryUrls.length,
      urlsCount,
      sitemapFilesCount: sitemapFiles.length,
      maxUrlsPerFile,
      sitemapFiles: sitemapFiles.map((file) => ({
        filename: basename(file.outputPath),
        outputPath: file.outputPath,
        downloadUrl: `/adm/tech/sitemap/download?file=${encodeURIComponent(
          basename(file.outputPath),
        )}`,
      })),
      isSitemapIndex: true,
      domain,
      locales,
    };
  }

  private buildStaticSitemapUrls(domain: string, locales: string[]) {
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

  private async buildTenderSitemapUrls(
    domain: string,
    locales: string[],
  ): Promise<{ loc: string; lastmod: string }[]> {
    const tenders = await TenderModel.find({ id: { $exists: true } })
      .select('id updatedAt')
      .lean<SitemapTender[]>();

    if (!tenders.length) {
      return [];
    }

    return tenders.flatMap((tender) => {
      return locales
        .map((locale) => {
          if (!tender.id) {
            return null;
          }

          return {
            loc: `${domain}/${locale}/tenders/${encodeURIComponent(tender.id)}`,
            lastmod: tender.updatedAt?.toISOString(),
          };
        })
        .filter(Boolean);
    }) as { loc: string; lastmod: string }[];
  }

  private async buildCpvIndustrySitemapUrls(
    domain: string,
  ): Promise<{ loc: string }[]> {
    const tenders = await TenderModel.find({
      'cpvCodes.0': { $exists: true },
    })
      .select('cpvCodes')
      .lean();

    const industryCodeSet = new Set<string>();

    for (const tender of tenders) {
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
      }))
      .filter(Boolean) as { loc: string }[];
  }

  private async buildCountrySitemapUrls(domain: string, locales: string[]) {
    const tendersWithCountries = await TenderModel.find({
      'placeOfPerformanceCountries.0': { $exists: true },
    });

    const euCountriesCodes = Array.from(EUROPEAN_CODES);
    const euUrls: string[] = [];

    const tenderCountriesUrls: string[] = locales.flatMap((locale) => {
      euCountriesCodes.forEach((countryCode) => {
        const slug = COUNTRY_DATA[countryCode]?.slug;

        if (slug) {
          euUrls.push(
            `${domain}/${locale}/countries/${encodeURIComponent(slug)}`,
          );
        }
      });

      return tendersWithCountries.flatMap((tender) => {
        const countries = tender.placeOfPerformanceCountries || [];

        return countries
          .map((countryCode) => {
            const slug = COUNTRY_DATA[countryCode]?.slug;
            if (!slug) {
              return null;
            }

            return `${domain}/${locale}/countries/${encodeURIComponent(slug)}`;
          })
          .filter(Boolean);
      });
    }) as string[];

    return Array.from(new Set([...euUrls, ...tenderCountriesUrls])).map(
      (url) => {
        return {
          loc: url,
        };
      },
    );
  }

  private getIndexableCpvIndustryCodes(cpvCode: string) {
    const candidates = [
      cpvCode.slice(0, 2) + '000000',
      cpvCode.slice(0, 3) + '00000',
      cpvCode.slice(0, 4) + '0000',
      cpvCode,
    ];

    return Array.from(new Set(candidates)).filter((code) => {
      const industry = CPV_INDUSTRIES[code];

      return industry?.slug && industry.level >= 2 && industry.level <= 4;
    });
  }
  private async buildCountryIndustrySitemapUrls(
    domain: string,
    locales: string[],
  ) {
    const tenders = await TenderModel.find({
      'placeOfPerformanceCountries.0': { $exists: true },
      'cpvCodes.0': { $exists: true },
    })
      .select('placeOfPerformanceCountries cpvCodes')
      .lean();

    const urlSet = new Set<string>();

    for (const tender of tenders) {
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

  private buildSitemapXml(
    urls: Array<{ loc: string; lastmod?: string; priority?: number }>,
  ) {
    const urlEntries = urls
      .map((url) => {
        const lastmod = url.lastmod
          ? `\n    <lastmod>${this.escapeXml(url.lastmod)}</lastmod>`
          : '';

        const priority =
          typeof url.priority === 'number'
            ? `\n    <priority>${url.priority.toFixed(1)}</priority>`
            : '';

        return `  <url>\n    <loc>${this.escapeXml(url.loc)}</loc>${lastmod}${priority}\n  </url>`;
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
    maxUrlsPerFile: number,
  ) {
    if (urls.length <= maxUrlsPerFile) {
      return [
        {
          outputPath,
          xml: this.buildSitemapXml(urls),
        },
      ];
    }

    const parsedOutputPath = parse(outputPath);
    const chunks: Array<{ outputPath: string; xml: string }> = [];

    for (let index = 0; index < urls.length; index += maxUrlsPerFile) {
      const chunkUrls = urls.slice(index, index + maxUrlsPerFile);
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
