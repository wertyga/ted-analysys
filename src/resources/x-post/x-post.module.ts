import { Module } from '@nestjs/common';
import { XPostAdmController } from './x-post.adm.controller';
import { XPostService } from './x-post.service';
import { XPostImageService } from './image/x-post-image.service';
import { XPostDataService } from './x-post-data.service';

@Module({
  controllers: [XPostAdmController],
  providers: [XPostService, XPostImageService, XPostDataService],
  exports: [XPostService],
})
export class XPostModule {}
