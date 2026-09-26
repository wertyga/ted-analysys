import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from '../google-auth.service';
import { DateRange } from '../google.types';
import {
  GscRow,
  SearchConsoleDimension,
  SearchConsoleFilter,
} from './search-console.types';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

interface GscApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

/**
 * Google Search Console Search Analytics client. The service account email
 * must be added as a user of the property (Restricted is enough).
 */
@Injectable()
export class SearchConsoleService {
  constructor(
    private readonly configService: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  /** "sc-domain:example.com" for a domain property or "https://example.com/" for a URL-prefix one. */
  getSiteUrl(): string | undefined {
    return this.configService.get<string>('GSC_SITE_URL') || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.getSiteUrl());
  }

  /** Site origin ("https://example.com") derived from the property id. */
  getSiteOrigin(): string | undefined {
    const siteUrl = this.getSiteUrl();

    if (!siteUrl) return undefined;
    if (siteUrl.startsWith('sc-domain:')) {
      return `https://${siteUrl.slice('sc-domain:'.length)}`;
    }

    try {
      return new URL(siteUrl).origin;
    } catch {
      return undefined;
    }
  }

  async query(
    range: DateRange,
    dimensions: SearchConsoleDimension[],
    rowLimit = 1000,
    /** All filters must match (AND). */
    filters: SearchConsoleFilter[] = [],
  ): Promise<GscRow[]> {
    const siteUrl = this.getSiteUrl();

    if (!siteUrl) {
      throw new ServiceUnavailableException('GSC_SITE_URL is not configured');
    }

    const data = await this.googleAuthService.post<{ rows?: GscApiRow[] }>(
      SCOPE,
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        siteUrl,
      )}/searchAnalytics/query`,
      {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions,
        rowLimit,
        dataState: 'final',
        ...(filters.length && { dimensionFilterGroups: [{ filters }] }),
      },
    );

    return (data.rows ?? []).map((row) => ({
      key: (row.keys ?? []).join(' | '),
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }));
  }
}
