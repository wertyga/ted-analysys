import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExtractCompanyProfileFromWebsiteDto {
  @ApiProperty({
    example: 'https://acme.com',
    description: 'Company website; the protocol may be omitted (acme.com)',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2048)
  url: string;
}
