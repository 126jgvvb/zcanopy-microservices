import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SpacesService } from './spaces.service';
import { VideoTranscodeService } from './video-transcode.service';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly spacesService: SpacesService,
    private readonly transcodeService: VideoTranscodeService,
  ) {}

  @Post('presign')
  @ApiOperation({
    summary: 'Generate a presigned upload URL for DigitalOcean Spaces',
  })
  async presign(
    @Body() body: { filename: string; contentType: string; folder?: string },
  ) {
    if (!body.filename || !body.contentType) {
      throw new BadRequestException('filename and contentType are required');
    }

    return this.spacesService.generateUploadUrl(
      body.filename,
      body.contentType,
      body.folder || 'properties',
    );
  }

  @Post('proxy')
  @ApiOperation({
    summary:
      'Upload a file through the API gateway when CORS blocks direct Spaces uploads',
  })
  // Multer's default storage keeps the whole upload in the process heap. Without
  // a size limit a single large video can push the gateway past its container
  // memory and take every API route down with it, so cap it here.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: Number(process.env.UPLOAD_MAX_BYTES) || 64 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  async proxy(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
  ) {
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

  @Post('transcode')
  @ApiOperation({
    summary: 'Queue an uploaded video for background H.264/AAC transcoding',
  })
  async transcode(@Body() body: { key: string }) {
    return this.transcodeService.enqueue(body?.key);
  }

  @Get('transcode/:jobId')
  @ApiOperation({ summary: 'Check the status of a video transcode job' })
  async transcodeStatus(@Param('jobId') jobId: string) {
    const job = this.transcodeService.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Transcode job not found');
    }
    return job;
  }
}
