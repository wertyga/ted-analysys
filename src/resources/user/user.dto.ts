import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  TUser,
  TUserNotificationSettings,
  UserNotificationFrequency,
} from './user.types';
import { PaginationAndSortDto } from '@/Dto';
import { CpvCategoryResponseItem } from '@/resources/cpv/types';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrencySign } from '@/resources/codelist';
import { AiFitDecision } from '@/resources/tender-matching/tender-match.types';

export const USER_LIST_FIELDS = 'companyName email avatar';
export const USER_OWNER_FIELDS = 'companyName email avatar';

type CompanyProfileType = Pick<
  TUser,
  | 'companyName'
  | 'country'
  | 'operatingCountries'
  | 'companySize'
  | 'companyDescription'
  | 'languages'
  | 'minDaysBeforeDeadline'
  | 'certifications'
  | 'capabilities'
  | 'yearsOfExperience'
  | 'publicProcurementExperience'
  | 'typicalContractSize'
  | 'notifications'
>;

export class UserNotificationSettingsDto implements TUserNotificationSettings {
  @ApiPropertyOptional({
    enum: UserNotificationFrequency,
    example: UserNotificationFrequency.WEEKLY,
  })
  @IsOptional()
  @IsEnum(UserNotificationFrequency)
  [AiFitDecision.MAYBE]?: UserNotificationFrequency;

  @ApiPropertyOptional({
    enum: UserNotificationFrequency,
    example: UserNotificationFrequency.DAILY,
  })
  @IsOptional()
  @IsEnum(UserNotificationFrequency)
  [AiFitDecision.GOOD_FIT]?: UserNotificationFrequency;

  @ApiPropertyOptional({
    enum: UserNotificationFrequency,
    example: UserNotificationFrequency.INSTANT,
  })
  @IsOptional()
  @IsEnum(UserNotificationFrequency)
  [AiFitDecision.STRONG_FIT]?: UserNotificationFrequency;
}

export class TypicalContractSizeDto {
  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @IsNumber()
  min?: number;

  @ApiPropertyOptional({ example: 250000 })
  @IsOptional()
  @IsNumber()
  max?: number;

  @ApiPropertyOptional({ enum: CurrencySign, example: CurrencySign.EUR })
  @IsOptional()
  @IsEnum(CurrencySign)
  currency?: CurrencySign;
}

type UserListType = Pick<TUser, 'email' | 'companyName'>;
export class UserListDto implements UserListType {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  avatar: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  companyName: string;
}

type UserOwnerType = UserListType;
export class UserOwnerDto extends UserListDto implements UserOwnerType {}

export class UserDto extends UserOwnerDto implements CompanyProfileType {
  @ApiProperty({ example: 'PLN' })
  country: string;

  @ApiProperty({ type: [String], example: ['PLN', 'ENG'] })
  operatingCountries: string[];

  @ApiProperty({ example: 25, description: 'Number of people in the company' })
  companySize: number;

  @ApiProperty({
    example: 'Software development company focused on public sector systems.',
  })
  companyDescription: string;

  @ApiProperty({
    type: [CpvCategoryResponseItem],
  })
  industries: CpvCategoryResponseItem[];

  @ApiProperty({
    type: [CpvCategoryResponseItem],
  })
  mainServices: CpvCategoryResponseItem[];

  @ApiProperty({ type: [String], example: ['ENG', 'PLN'] })
  languages: string[];

  @ApiProperty({ example: 7 })
  minDaysBeforeDeadline: number;

  @ApiPropertyOptional({ type: [String], example: ['ISO 9001', 'CE'] })
  certifications?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['24/7 support', 'installation'],
  })
  capabilities?: string[];

  @ApiPropertyOptional({ example: 7 })
  yearsOfExperience?: number;

  @ApiPropertyOptional({ example: true })
  publicProcurementExperience?: boolean;

  @ApiPropertyOptional({ type: TypicalContractSizeDto })
  typicalContractSize?: TypicalContractSizeDto;

  @ApiPropertyOptional({ type: UserNotificationSettingsDto })
  notifications?: UserNotificationSettingsDto;
}

export class GetUsersRequestDto extends PaginationAndSortDto {}

export class UpdateUserNotificationsDto {
  @ApiProperty({ type: UserNotificationSettingsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => UserNotificationSettingsDto)
  notifications: UserNotificationSettingsDto;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ example: 'Acme Software Ltd.' })
  @IsNotEmpty()
  @IsString()
  companyName: string;

  @ApiProperty({ example: 'PLN' })
  @IsNotEmpty()
  @IsString()
  country: string;

  @ApiProperty({ type: [String], example: ['PLN', 'GR'] })
  @IsArray()
  @IsString({ each: true })
  operatingCountries: string[];

  @ApiProperty({ example: 25, description: 'Number of people in the company' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  companySize: number;

  @ApiProperty({
    example: 'Software development company focused on public sector systems.',
  })
  @IsNotEmpty()
  @IsString()
  companyDescription: string;

  @ApiProperty({
    type: [String],
    example: ['3200000', '32100000'],
  })
  @IsArray()
  @IsString({ each: true })
  industries: string[];

  @ApiProperty({
    type: [String],
    example: ['3201000', '32110000'],
  })
  @IsArray()
  mainServices: string[];

  @ApiProperty({ type: [String], example: ['ENG', 'PLN'] })
  @IsArray()
  @IsString({ each: true })
  languages: string[];

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minDaysBeforeDeadline?: number;

  @ApiPropertyOptional({ type: [String], example: ['ISO 9001', 'CE'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['24/7 support', 'installation'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsNumber()
  yearsOfExperience?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  publicProcurementExperience?: boolean;

  @ApiPropertyOptional({ type: TypicalContractSizeDto })
  @IsOptional()
  @IsObject()
  typicalContractSize?: TypicalContractSizeDto;
}

export class UserAuthDto extends UserDto {
  @ApiProperty()
  token: string;
}

export class UserMetaResponse {
  @ApiProperty()
  wishlistCount: number;

  @ApiProperty()
  deepAnalysisCount: number;
}
