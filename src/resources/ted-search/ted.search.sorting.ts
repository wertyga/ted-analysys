import { TedTenderSearchRequestDto } from './dto/ted-tender-search-request.dto';
import { TedSortOrder, TedTenderSortColumn } from './types/ted-search.types';

type MongoSort = Record<string, 1 | -1>;

const LOCAL_SORT_FIELDS: Record<TedTenderSortColumn, string> = {
  [TedTenderSortColumn.PUBLICATION_DATE]: 'publicationDate',
  [TedTenderSortColumn.DEADLINE]: 'submissionDeadline',
  [TedTenderSortColumn.NOTICE_TITLE]: 'title',
  [TedTenderSortColumn.BUYER_NAME]: 'buyerName',
  [TedTenderSortColumn.CREATED_AT]: 'createdAt',
  [TedTenderSortColumn.UPDATED_AT]: 'updatedAt',
};

export class TedSearchSorting {
  buildLocalTenderSort(filters: TedTenderSearchRequestDto): MongoSort {
    const sortField = this.resolveSortField(filters.sortColumn);
    const sortDirection = this.resolveSortDirection(filters.sortOrder);

    return {
      [sortField]: sortDirection,
      _id: -1,
    };
  }

  private resolveSortField(sortColumn: TedTenderSortColumn | undefined): string {
    if (!sortColumn) {
      return 'publicationDate';
    }

    return LOCAL_SORT_FIELDS[sortColumn] ?? 'publicationDate';
  }

  private resolveSortDirection(sortOrder: TedSortOrder | undefined): 1 | -1 {
    return sortOrder === TedSortOrder.ASC ? 1 : -1;
  }
}
