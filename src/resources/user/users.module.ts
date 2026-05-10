import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersAdmController } from './users.adm.controller';
import { UsersService } from './users.service';
import { UsersServiceUtils } from './users.service.utils';
import { CompanyFilterModule } from '@/resources/company-filter/company-filter.module';

@Module({
  imports: [CompanyFilterModule],
  controllers: [UsersController, UsersAdmController],
  providers: [UsersService, UsersServiceUtils],
  exports: [UsersService, UsersServiceUtils],
})
export class UsersModule {}
