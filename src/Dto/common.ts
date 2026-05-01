import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const headers = {
  authorization: {
    name: 'Authorization',
    description: "Authorization 'Bearer'",
    example: 'Bearer {bearer_token}',
    required: true,
  },
};

export class SuccessDto {
  @ApiProperty()
  @IsBoolean()
  success: boolean;
}
