import { Document, mongo, PipelineStage } from 'mongoose';
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

export const filterModel = <T = any>(
  document: Document,
  {
    excludeFields = '',
    includeFields = '',
  }: {
    excludeFields?: string;
    includeFields?: string;
  } = {} as any,
) => {
  const serializedDocument = document?.toObject
    ? document.toObject()
    : document;

  // Filter all fields that start with _ - private fields
  for (let key in serializedDocument) {
    if (/^_/.test(key) && key !== '_id') {
      delete serializedDocument[key];
    }
  }

  let result;
  if (excludeFields || includeFields) {
    if (excludeFields) {
      result = { ...serializedDocument };
      excludeFields.split(' ').forEach((field) => {
        delete result[field];
      });
    } else {
      result = { _id: serializedDocument._id };
      includeFields.split(' ').forEach((field) => {
        result[field] = serializedDocument[field];
      });
    }
  }

  return (result || serializedDocument) as T;
};

export const isMongoId = (value: any) => value instanceof mongo.ObjectId;

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
