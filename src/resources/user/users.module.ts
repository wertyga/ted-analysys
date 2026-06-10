import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersAdmController } from './users.adm.controller';
import { UsersService } from './users.service';
import { UsersServiceUtils } from './users.service.utils';
import { CompanyFilterModule } from '@/resources/company-filter/company-filter.module';
import { TenderWishlistModule } from '@/resources/tender-wishlist/tender-wishlist.module';
import { CpvModule } from '@/resources/cpv/cpv.module';
import { TariffModule } from '@/resources/tariff';
import { TenderMatchingModule } from '@/resources/tender-matching/tender-matching.module';

@Module({
  imports: [
    CompanyFilterModule,
    TenderWishlistModule,
    CpvModule,
    TariffModule,
    TenderMatchingModule,
  ],
  controllers: [UsersController, UsersAdmController],
  providers: [UsersService, UsersServiceUtils],
  exports: [UsersService, UsersServiceUtils],
})
export class UsersModule {}
