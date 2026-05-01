import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersAdmController } from './users.adm.controller';
import { UsersService } from './users.service';
import { UsersServiceUtils } from './users.service.utils';

@Module({
  imports: [],
  controllers: [UsersController, UsersAdmController],
  providers: [UsersService, UsersServiceUtils],
  exports: [UsersService, UsersServiceUtils],
})
export class UsersModule {}
