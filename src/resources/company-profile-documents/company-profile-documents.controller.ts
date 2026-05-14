import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@/guards';
import { CompanyProfileDocumentsService } from './company-profile-documents.service';
import { CompanyProfileDocumentFile } from './company-profile-documents.types';

@ApiTags('company-profile-documents')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('company-profile-documents')
export class CompanyProfileDocumentsController {
  constructor(
    private readonly companyProfileDocumentsService: CompanyProfileDocumentsService,
  ) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload company documents and fill current user profile fields',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['documents'],
    },
  })
  @ApiOkResponse({ description: 'Updated current user profile' })
  @UseInterceptors(
    FilesInterceptor('documents', 10, {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async uploadCompanyProfileDocuments(
    @Req() req,
    @UploadedFiles() files: CompanyProfileDocumentFile[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('At least one document is required');
    }

    return this.companyProfileDocumentsService.uploadAndApplyProfile(
      String(req.user._id),
      files,
    );
  }
}
