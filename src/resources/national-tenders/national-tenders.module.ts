import { Module } from '@nestjs/common';
import { PlTendersModule } from './countries/pl/pl.module';

/**
 * National (non-TED) tender sources. Each country is its own module under
 * `countries/<code>/` with its own controller, service and cron; shared
 * storage lives in `core/`.
 */
@Module({
  imports: [PlTendersModule],
})
export class NationalTendersModule {}
