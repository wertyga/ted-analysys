import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface CpvCategorySyncResult {
  sourceVersion: string;
  fetchedCount: number;
  insertedCount: number;
  modifiedCount: number;
  upsertedCount: number;
  matchedCount: number;
}

export interface CpvCategorySlugSyncResult {
  matchedCount: number;
  modifiedCount: number;
}

export class CpvCategoryResponseItem {
  @ApiProperty({ example: '72000000' })
  code!: string;

  @ApiProperty({
    example:
      'IT services: consulting, software development, Internet and support',
  })
  name!: string;

  @ApiPropertyOptional({
    example: 'it-services-consulting-software-development-internet-and-support',
  })
  slug?: string;

  @ApiPropertyOptional({ example: '72000000' })
  parentCode?: string;

  @ApiProperty({ example: 2 })
  level!: number;
}

export class CpvCategoriesResponse {
  @ApiProperty({ example: 50 })
  count!: number;

  @ApiProperty({ type: [CpvCategoryResponseItem] })
  items!: CpvCategoryResponseItem[];
}
