export type BuyerIntelligenceCpvPayload = {
  code: string;
  name: string;
  shortTitle?: string;
};

export type BuyerIntelligenceCodeNamePayload = {
  code: string;
  name: string;
};

export type BuyerIntelligenceAiPayload = {
  /**
   * Stable buyer profile data.
   * Used to describe who the buyer is and what type of organization it appears to be.
   */
  buyer: {
    /**
     * Official buyer name.
     */
    name: string;

    /**
     * Buyer country from buyer address, not place of performance.
     */
    country?: string;

    /**
     * Buyer regional subdivision/state/region if available.
     */
    countrySub?: string;

    /**
     * Buyer city from address.
     */
    city?: string;

    /**
     * Legal/category types of the buyer, e.g. public authority, body governed by public law.
     */
    legalTypes: BuyerIntelligenceCodeNamePayload[];

    /**
     * Buyer main activities/sectors, e.g. health, education, general public services, transport.
     */
    mainActivities: BuyerIntelligenceCodeNamePayload[];

    /**
     * Official buyer websites.
     */
    websites: string[];

    /**
     * Buyer procurement profile / procurement portal URLs.
     */
    profiles: string[];
  };

  /**
   * Deterministic statistics calculated by backend from Tender and AwardTender history.
   * AI must treat these values as facts and should not recalculate them.
   */
  stats: {
    /**
     * Total number of known competition/notice tenders linked to this buyer.
     */
    tendersCount: number;

    /**
     * Total number of known award/result tenders linked to this buyer.
     */
    awardTendersCount: number;

    /**
     * Number of tenders published by this buyer in the last 12 months.
     * Used for activity level explanation.
     */
    tendersLast12Months: number;

    /**
     * Sum of estimated tender values in EUR from competition tenders.
     * Represents planned procurement volume, not awarded spend.
     */
    totalEstimatedValueEur: number | null;

    /**
     * Sum of awarded contract values in EUR from award tenders.
     * Represents known awarded spend.
     */
    totalAwardedValueEur: number | null;

    /**
     * Average estimated tender value in EUR.
     * Calculated only from tenders where estimated value is available.
     */
    avgEstimatedValueEur: number | null;

    /**
     * Average awarded contract value in EUR.
     * Calculated only from award tenders where awarded value is available.
     */
    avgAwardedValueEur: number | null;

    /**
     * Most frequent CPV codes in this buyer's tender history.
     * Used to identify what the buyer usually purchases.
     */
    topCpvCodes: {
      cpv: BuyerIntelligenceCpvPayload;
      count: number;
    }[];

    /**
     * Most frequent place-of-performance countries in this buyer's tenders.
     * This is not the same as buyer country.
     */
    topCountries: {
      country: string;
      count: number;
    }[];

    /**
     * Supplier countries aggregated from suppliers that won contracts from this buyer.
     * Count is the number of wins by suppliers from this country.
     */
    supplierCountries: {
      country: string;
      count: number;
    }[];

    /**
     * Suppliers that most frequently won contracts from this buyer.
     * Calculated from award tenders.
     */
    topSuppliers: {
      /**
       * Winner/supplier name.
       */
      name: string;

      /**
       * Winner/supplier country if available.
       */
      country?: string;

      /**
       * Number of awards won from this buyer.
       */
      wins: number;
    }[];

    /**
     * Share of awards won by repeat suppliers.
     * Example: 0.6 means 60% of known awards went to suppliers with 2+ wins.
     */
    repeatSupplierRate: number | null;

    /**
     * Share of awards won by suppliers from the same country as the buyer.
     * Example: 0.75 means 75% of known winners are local/domestic suppliers.
     */
    localSupplierRate: number | null;
  };

  /**
   * Deterministic signals calculated by backend.
   * AI must not change these levels, only explain them.
   */
  signals: {
    /**
     * Buyer activity based mainly on tenders in the last 12 months.
     */
    activityLevel: 'inactive' | 'low' | 'medium' | 'high';

    /**
     * Signal that the buyer repeatedly awards contracts to the same suppliers.
     * Historical signal only, not proof of unfairness.
     */
    incumbentRisk: 'low' | 'medium' | 'high' | 'unknown';

    /**
     * Signal that the buyer often awards contracts to suppliers from the buyer's country.
     * Historical signal only, not proof of discrimination.
     */
    localSupplierSignal: 'low' | 'medium' | 'high' | 'unknown';
  };

  /**
   * Recent competition tenders used as supporting examples.
   * Should be limited, e.g. latest 20-30 records.
   */
  recentTenders: {
    /**
     * Tender publication date.
     */
    publicationDate?: string;

    /**
     * Estimated tender value in EUR if available.
     */
    estimatedValueEur?: number | null;

    /**
     * CPV category names associated with this tender.
     */
    cpvCodes?: string[];

    /**
     * Place-of-performance countries.
     */
    countries?: string[];

    /**
     * Contract nature, e.g. services, supplies, works.
     */
    contractNature?: string;

    /**
     * Procedure type, e.g. open, restricted, negotiated.
     */
    procedureType?: string;
  }[];

  /**
   * Recent awarded tenders used to understand supplier patterns.
   * Should be limited, e.g. latest 20-30 records.
   */
  recentAwardTenders: {
    /**
     * Award/result notice publication date.
     */
    publicationDate?: string;

    /**
     * Total awarded value in EUR for this award notice if available.
     */
    awardedValueEur?: number | null;

    /**
     * CPV category names associated with this award tender.
     */
    cpvCodes?: string[];

    /**
     * Winners/suppliers in this award notice.
     * Multiple winners are possible.
     */
    winners: {
      /**
       * Winner/supplier name.
       */
      name: string;

      /**
       * Winner/supplier country if available.
       */
      country?: string;

      /**
       * Winner/supplier city if available.
       */
      city?: string;

      /**
       * Awarded value attributed to this winner if available.
       */
      awardedValueEur?: number | null;
    }[];
  }[];
};
