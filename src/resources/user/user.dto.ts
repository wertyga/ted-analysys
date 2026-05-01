import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TUser } from './user.types';
import { PaginationAndSortDto } from '@/Dto';

export const USER_LIST_FIELDS = 'username email avatar';
export const USER_OWNER_FIELDS = 'username email avatar';

type UserListType = Pick<TUser, 'email' | 'username'>;
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
  username: string;
}

type UserOwnerType = UserListType;
export class UserOwnerDto extends UserListDto implements UserOwnerType {}

export class UserDto extends UserOwnerDto {}

export class GetUsersRequestDto extends PaginationAndSortDto {}

export class UpdateUserDto {
  @ApiPropertyOptional()
  username?: string;

  @ApiPropertyOptional()
  avatar?: string;
}

export class UserAuthDto extends UserDto {
  @ApiProperty()
  token: string;
}
