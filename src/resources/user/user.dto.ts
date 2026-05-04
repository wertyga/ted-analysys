import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { COMPANY_SIZE, TUser } from './user.types';
import { PaginationAndSortDto } from '@/Dto';
import { CpvCategoryResponseItem } from '@/resources/cpv/types';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export const USER_LIST_FIELDS = 'companyName email avatar';
export const USER_OWNER_FIELDS = 'companyName email avatar';

type CompanyProfileType = Pick<
  TUser,
  | 'companyName'
  | 'country'
  | 'operatingRegions'
  | 'companySize'
  | 'companyDescription'
  | 'languages'
>;

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
  operatingRegions: string[];

  @ApiProperty({ enum: COMPANY_SIZE, example: COMPANY_SIZE.SME })
  companySize: COMPANY_SIZE;

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
}

export class GetUsersRequestDto extends PaginationAndSortDto {}

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
  operatingRegions: string[];

  @ApiProperty({ enum: COMPANY_SIZE, example: COMPANY_SIZE.SME })
  @IsEnum(COMPANY_SIZE)
  companySize: COMPANY_SIZE;

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
}

export class UserAuthDto extends UserDto {
  @ApiProperty()
  token: string;
}
