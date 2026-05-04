import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { COMPANY_SIZE } from '@/resources/user/user.types';

export class OauthBase {
  @ApiProperty({ required: true })
  email: string;

  @ApiProperty({ required: true })
  companyName: string;

  @ApiPropertyOptional()
  avatar?: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;
}

export class SignInUserDto {
  @ApiProperty({
    description: 'E-mail',
    example: 'john@gmail.com',
    required: true,
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password',
    example: 'password',
    required: true,
  })
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskIds?: string[];
}

export class CreateUserDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @Length(6)
  password: string;

  @ApiProperty({ required: true })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  redirectUrl?: string;
}

export class ConfirmEmailDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  token: string;
}

export class GoogleSignInDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  jwt: string;
}

export class ChangePasswordDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsString()
  token: string;
}

export class ChangePasswordInitDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class ChangeEmailDto {
  @ApiProperty({ required: true })
  @IsNotEmpty()
  @IsEmail()
  newEmail: string;

  @ApiProperty({ required: true })
  @IsNotEmpty()
  password: string;
}

export class OauthSignInDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty()
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

  @ApiProperty({ type: [String], example: ['3200000'] })
  @IsArray()
  @IsString({ each: true })
  industries: string[];

  @ApiProperty({ type: [String], example: ['3201000'] })
  @IsArray()
  @IsString({ each: true })
  mainServices: string[];

  @ApiProperty({ type: [String], example: ['ENG', 'PLN'] })
  @IsArray()
  @IsString({ each: true })
  languages: string[];
}
