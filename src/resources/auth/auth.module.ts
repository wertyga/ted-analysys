import { Module } from '@nestjs/common';
import { EmailModule } from '@/resources/email/email.module';
import { UsersModule } from '@/resources/user/users.module';
import { CouponModule } from '@/resources/coupon';
import { AuthController } from './auth.controller';
import { AuthAdmController } from './auth.adm.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [EmailModule, UsersModule, CouponModule],
  controllers: [AuthController, AuthAdmController],
  providers: [AuthService],
})
export class AuthModule {}
