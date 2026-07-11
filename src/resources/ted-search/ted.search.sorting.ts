import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { TedSortOrder, TedTenderSortColumn } from './types/ted-search.types';
import { TED_SEARCH_CONFIG } from '@/config/ted-search.config';

type MongoSort = Record<string, 1 | -1>;

export class TedSearchSorting {
  buildLocalTenderSort(filters: TedTenderSearchRequestDto): MongoSort {
    const sortField = this.resolveSortField(filters.sortColumn);
    const sortDirection = this.resolveSortDirection(filters.sortOrder);

    return {
      [sortField]: sortDirection,
    };
  }

  private resolveSortField(
    sortColumn: TedTenderSortColumn | undefined,
  ): string {
    if (!sortColumn) {
      return TED_SEARCH_CONFIG.defaultLocalSortField;
    }

    return (
      TED_SEARCH_CONFIG.localSortFields[sortColumn] ??
      TED_SEARCH_CONFIG.defaultLocalSortField
    );
  }

  private resolveSortDirection(sortOrder: TedSortOrder | undefined): 1 | -1 {
    return sortOrder === TedSortOrder.ASC ? 1 : -1;
  }
}
