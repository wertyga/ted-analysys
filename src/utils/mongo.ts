import { mongo, Types } from 'mongoose';
import { PaginationAndSortDto, SortDto } from '@/Dto';
import { SORT_DIRECTION, SORT_TYPE } from '@/types';

export const getCursorQuery = (data: Record<string, any>) => {
  const result = {};
  for (let key in data) {
    if (data[key]) {
      result[key] = data[key];
    }
  }

  return result;
};

export const getLimitsCursor = (
  {
    limit = 12,
    offset = 0,
  }: { limit?: number | string; offset?: number | string },
  cursor,
) => {
  return cursor.skip(Number(offset)).limit(Number(limit));
};

export const getPaginationMeta = ({
  page,
  limit,
  defaultPage = 1,
  defaultLimit = 20,
  maxLimit = 100,
}: {
  page?: number | null;
  limit?: number | null;
  defaultPage?: number;
  defaultLimit?: number;
  maxLimit?: number;
}) => {
  const normalizedPage = Math.max(1, page ?? defaultPage);
  const normalizedLimit = Math.min(
    maxLimit,
    Math.max(1, limit ?? defaultLimit),
  );

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit,
  };
};

export const getSortMeta = (sortData = {} as SortDto, cursor?) => {
  const { sortBy = SORT_TYPE.CreatedAt, sortDirection = SORT_DIRECTION.DESC } =
    sortData;
  const numDirection: 1 | -1 = sortDirection === SORT_DIRECTION.ASC ? 1 : -1;
  switch (sortBy) {
    case SORT_TYPE.CreatedAt:
      return {
        field: 'createdAt',
        cursor: cursor && cursor.sort({ createdAt: numDirection }),
        numDirection,
      };
    case SORT_TYPE.Price:
      return {
        field: 'price',
        cursor: cursor && cursor.sort({ price: numDirection }),
        numDirection,
      };

    default:
      return {
        field: undefined,
        numDirection,
        cursor,
      };
  }
};

export const getLimitAndSortCursor = (
  { limit, offset, sortBy, sortDirection }: PaginationAndSortDto,
  cursor,
) => {
  return getSortMeta(
    { sortBy, sortDirection },
    getLimitsCursor({ limit, offset }, cursor),
  ).cursor;
};

type StringKeyOf<T> = Extract<keyof T, string>;

export const filterModel = <T extends Record<string, any>>(
  document: T,
  {
    excludeFields,
    includeFields,
  }: {
    excludeFields?: StringKeyOf<T>[];
    includeFields?: StringKeyOf<T>[];
  } = {},
) => {
  if (typeof document === 'string' || !document) {
    return document;
  }

  if (isMongoId(document)) {
    return document.toString();
  }

  const serializedDocument =
    'toObject' in document ? document.toObject() : document;

  for (const key in serializedDocument) {
    if (/^_/.test(key) && key !== '_id') {
      delete serializedDocument[key];
    }
  }

  if (!excludeFields && !includeFields) {
    return serializedDocument;
  }

  if (excludeFields) {
    excludeFields.forEach((field) => {
      delete serializedDocument![field];
    });

    return serializedDocument;
  } else {
    const result = { _id: serializedDocument._id } as typeof serializedDocument;

    includeFields?.forEach((field) => {
      result[field] = serializedDocument[field];
    });

    return result;
  }
};

export const isMongoId = (value: any) => value instanceof mongo.ObjectId;

export const isPopulatedRecord = (
  value: unknown,
): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !isMongoId(value);
};

export const toObjectId = (value: unknown): Types.ObjectId | null => {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value);
  }

  return null;
};

export const getMongoRelationObjectId = (value: unknown): string | null => {
  const objectId = toObjectId(value);

  if (objectId) {
    return objectId.toString();
  }

  if (!value || typeof value !== 'object' || !('_id' in value)) {
    return null;
  }

  return toObjectId(value._id)?.toString() ?? null;
};

export const getMongoRelationObjectIdArray = (
  values: unknown[],
  key?: string,
): string[] => {
  return Array.from(
    new Set(
      values.flatMap((value) => {
        const objectId = getMongoRelationObjectId(
          typeof value === 'object' && key ? value?.[key] : value,
        );

        return objectId ? [objectId] : [];
      }),
    ),
  );
};

// Check if field is _id, then return _id, but if the field is object - handle object
export const serializeMongoObjectId = (
  { value },
  callback?: (v: any) => any,
) => {
  if (!value) return undefined;

  const goFunc = (v) => {
    if (isMongoId(v)) {
      return String(v);
    }
    if (callback) {
      return callback(v);
    }
    return v.toObject ? v.toObject() : v;
  };

  if (Array.isArray(value)) {
    return value.map(goFunc);
  }

  return goFunc(value);
};

export function toRecord<T>(documentOrRecord: T) {
  return 'toObject' in (documentOrRecord as any)
    ? (documentOrRecord as any).toObject()
    : documentOrRecord;
}
