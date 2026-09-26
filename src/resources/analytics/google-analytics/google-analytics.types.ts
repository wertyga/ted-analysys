export interface Ga4ReportRow {
  /** Dimension values in the requested order. */
  dimensions: string[];
  /** Metric values keyed by metric name. */
  metrics: Record<string, number>;
}
