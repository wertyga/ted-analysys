export type TSerializeOptions<T = any> = Partial<{
  excludeFields: (keyof T)[];
  includeFields: (keyof T)[];
}>;
