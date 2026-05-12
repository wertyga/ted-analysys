import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersAdmController } from './users.adm.controller';
import { UsersService } from './users.service';
import { UsersServiceUtils } from './users.service.utils';
import { CompanyFilterModule } from '@/resources/company-filter/company-filter.module';
import { TenderWishlistModule } from '@/resources/tender-wishlist/tender-wishlist.module';

@Module({
  imports: [CompanyFilterModule, TenderWishlistModule],
  controllers: [UsersController, UsersAdmController],
  providers: [UsersService, UsersServiceUtils],
  exports: [UsersService, UsersServiceUtils],
})
export class UsersModule {}
