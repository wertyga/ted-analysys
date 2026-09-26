import { Module } from '@nestjs/common';
import { GoogleAuthModule } from '../google-auth.module';
import { SearchConsoleService } from './search-console.service';

@Module({
  imports: [GoogleAuthModule],
  providers: [SearchConsoleService],
  exports: [SearchConsoleService],
})
export class SearchConsoleModule {}
