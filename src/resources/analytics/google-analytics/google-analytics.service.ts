import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from '../google-auth.service';
import { DateRange } from '../google.types';
import { Ga4ReportRow } from './google-analytics.types';

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

interface Ga4ApiResponse {
  metricHeaders?: { name: string }[];
  rows?: {
    dimensionValues?: { value?: string }[];
    metricValues?: { value?: string }[];
  }[];
}

/**
 * Google Analytics 4 Data API client. The service account email must be
 * added as a Viewer on the GA4 property.
 */
@Injectable()
export class GoogleAnalyticsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  /** Numeric GA4 property id (Admin -> Property settings). */
  getPropertyId(): string | undefined {
    return this.configService.get<string>('GA4_PROPERTY_ID') || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.getPropertyId());
  }

  /** Runs a report ordered by the first metric, descending. */
  async runReport(
    range: DateRange,
    dimensions: string[],
    metrics: string[],
    limit = 100,
    /** GA4 FilterExpression, e.g. { filter: { fieldName, stringFilter } }. */
    dimensionFilter?: Record<string, unknown>,
  ): Promise<Ga4ReportRow[]> {
    const propertyId = this.getPropertyId();

    if (!propertyId) {
      throw new ServiceUnavailableException(
        'GA4_PROPERTY_ID is not configured',
      );
    }

    const data = await this.googleAuthService.post<Ga4ApiResponse>(
      SCOPE,
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        dateRanges: [range],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        orderBys: [{ metric: { metricName: metrics[0] }, desc: true }],
        limit,
        ...(dimensionFilter && { dimensionFilter }),
      },
    );

    const metricNames = (data.metricHeaders ?? []).map((m) => m.name);

    return (data.rows ?? []).map((row) => ({
      dimensions: (row.dimensionValues ?? []).map((v) => v.value ?? ''),
      metrics: Object.fromEntries(
        metricNames.map((name, index) => [
          name,
          Number(row.metricValues?.[index]?.value ?? 0),
        ]),
      ),
    }));
  }
}
