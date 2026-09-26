import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MarketingTaskCategory,
  MarketingTaskStatus,
  Priority,
} from '../marketing-task.types';

export class GenerateMarketingTasksDto {
  @ApiPropertyOptional({
    example: 28,
    description:
      'Length of the analyzed period in days; compared with the previous period of the same length.',
  })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  maxTasks?: number;

  @ApiPropertyOptional({ example: 'ru', description: 'Language of the tasks.' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class CheckMarketingTaskDto {
  @ApiPropertyOptional({
    example: 14,
    description:
      'Length of the compared periods in days (recent period vs the one before).',
  })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number;

  @ApiPropertyOptional({ example: 'ru', description: 'Language of the note.' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class CreateMarketingTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(3000)
  description: string;

  @ApiProperty({ enum: MarketingTaskCategory })
  @IsEnum(MarketingTaskCategory)
  category: MarketingTaskCategory;

  @ApiPropertyOptional({ enum: Priority, default: Priority.medium })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateMarketingTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @ApiPropertyOptional({ enum: MarketingTaskStatus })
  @IsOptional()
  @IsEnum(MarketingTaskStatus)
  status?: MarketingTaskStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class AddMarketingTaskCommentDto {
  @ApiProperty({
    description:
      'What was done on the site, a blocker or a question; the AI reads it on the next analysis run.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

export class GetMarketingTasksRequestDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => Number(value))
  limit?: number = 20;

  @ApiPropertyOptional({ enum: MarketingTaskStatus })
  @IsOptional()
  @IsEnum(MarketingTaskStatus)
  status?: MarketingTaskStatus;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ enum: MarketingTaskCategory })
  @IsOptional()
  @IsEnum(MarketingTaskCategory)
  category?: MarketingTaskCategory;

  @ApiPropertyOptional({
    enum: ['priority', 'recent'],
    default: 'priority',
    description:
      'priority = by priority, newest first; recent = last updated first.',
  })
  @IsOptional()
  @IsIn(['priority', 'recent'])
  sort?: 'priority' | 'recent';
}
