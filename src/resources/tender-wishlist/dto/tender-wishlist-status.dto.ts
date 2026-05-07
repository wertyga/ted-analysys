import { ApiProperty } from '@nestjs/swagger';

export class TenderWishlistStatusDto {
  @ApiProperty({ example: '756265-2023' })
  tenderId!: string;

  @ApiProperty({ example: true })
  isInWishlist!: boolean;
}
