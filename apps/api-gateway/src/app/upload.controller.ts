import { Controller, Post, Body, BadRequestException, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SpacesService } from './spaces.service';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly spacesService: SpacesService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Generate a presigned upload URL for DigitalOcean Spaces' })
  async presign(@Body() body: { filename: string; contentType: string; folder?: string }) {
    if (!body.filename || !body.contentType) {
      throw new BadRequestException('filename and contentType are required');
    }

    return this.spacesService.generateUploadUrl(body.filename, body.contentType, body.folder || 'properties');
  }

  @Post('proxy')
  @ApiOperation({ summary: 'Upload a file through the API gateway when CORS blocks direct Spaces uploads' })
  @UseInterceptors(FileInterceptor('file'))
  async proxy(@UploadedFile() file: Express.Multer.File, @Query('folder') folder?: string) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const result = await this.spacesService.uploadBuffer(
      file.originalname,
      file.mimetype,
      file.buffer,
      folder || 'properties',
    );

    return {
      key: result.key,
      publicUrl: result.publicUrl,
    };
  }
}
