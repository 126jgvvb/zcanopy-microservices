import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { SpacesService } from './spaces.service';

export type TranscodeJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface TranscodeJobView {
  jobId: string;
  status: TranscodeJobStatus;
  publicUrl: string | null;
  error?: string;
}

interface TranscodeJob extends TranscodeJobView {
  key: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  attempts: number;
}

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'm4v',
  'mov',
  'webm',
  '3gp',
  '3g2',
  'avi',
  'mkv',
  'mts',
  'm2ts',
  'wmv',
  'flv',
  'ogv',
  'mpeg',
  'mpg',
]);

const MB = 1024 * 1024;

/**
 * Downloads freshly uploaded videos from Spaces, re-encodes them to a
 * bandwidth-friendly H.264/AAC MP4 and writes the result back to the same
 * object key.
 *
 * Re-encoding in place keeps the URL returned by the upload endpoint stable,
 * so a client that times out waiting for the job still ends up pointing at the
 * optimised file once the job finishes. Jobs run through a small in-process
 * queue because transcoding is CPU/memory heavy; a single Railway instance
 * should not run many of them at once.
 */
@Injectable()
export class VideoTranscodeService implements OnModuleDestroy {
  private readonly logger = new Logger(VideoTranscodeService.name);
  private readonly jobs = new Map<string, TranscodeJob>();
  private readonly queue: string[] = [];
  private readonly maxConcurrent: number;
  private readonly jobTimeoutMs: number;
  private readonly maxSourceBytes: number;
  private readonly preset: string;
  private readonly maxRate: string;
  private readonly bufferSize: string;
  private active = 0;
  private ffmpegPath: string | null = null;
  private disposed = false;

  constructor(
    private readonly spaces: SpacesService,
    private readonly configService: ConfigService,
  ) {
    this.maxConcurrent = this.positiveInt('VIDEO_TRANSCODE_CONCURRENCY', 1, 1);
    this.jobTimeoutMs = this.positiveInt(
      'VIDEO_TRANSCODE_TIMEOUT_MS',
      20 * 60 * 1000,
      10_000,
    );
    this.maxSourceBytes = this.positiveInt(
      'VIDEO_TRANSCODE_MAX_BYTES',
      300 * MB,
      MB,
    );
    this.preset =
      this.configService.get<string>('VIDEO_TRANSCODE_PRESET') || 'veryfast';
    this.maxRate =
      this.configService.get<string>('VIDEO_TRANSCODE_MAX_RATE') || '3000k';
    this.bufferSize =
      this.configService.get<string>('VIDEO_TRANSCODE_BUFFER_SIZE') || '6000k';
  }

  onModuleDestroy() {
    this.disposed = true;
  }

  enqueue(key: string): TranscodeJobView {
    const normalizedKey = this.assertVideoKey(key);

    const existing = Array.from(this.jobs.values()).find(
      (job) =>
        job.key === normalizedKey &&
        (job.status === 'queued' || job.status === 'processing'),
    );
    if (existing) {
      return this.toView(existing);
    }

    const job: TranscodeJob = {
      jobId: randomUUID(),
      key: normalizedKey,
      status: 'queued',
      publicUrl: null,
      createdAt: Date.now(),
      attempts: 0,
    };

    this.jobs.set(job.jobId, job);
    this.queue.push(job.jobId);
    this.prune();
    this.processQueue();

    return this.toView(job);
  }

  getJob(jobId: string): TranscodeJobView | null {
    const job = this.jobs.get(jobId);
    return job ? this.toView(job) : null;
  }

  private toView(job: TranscodeJob): TranscodeJobView {
    return {
      jobId: job.jobId,
      status: job.status,
      // Version the URL with the completion time. Spaces/Cloudflare may have
      // cached the original upload briefly; a distinct cache key guarantees
      // the first playback request fetches the optimised file.
      publicUrl:
        job.status === 'done'
          ? `${this.spaces.publicUrlFor(job.key)}?v=${job.finishedAt ?? Date.now()}`
          : null,
      ...(job.error ? { error: job.error } : {}),
    };
  }

  private processQueue(): void {
    while (
      !this.disposed &&
      this.active < this.maxConcurrent &&
      this.queue.length > 0
    ) {
      const jobId = this.queue.shift();
      if (!jobId) return;
      const job = this.jobs.get(jobId);
      if (!job || job.status !== 'queued') continue;

      this.active += 1;
      void this.run(job).finally(() => {
        this.active -= 1;
        this.processQueue();
      });
    }
  }

  private async run(job: TranscodeJob): Promise<void> {
    job.status = 'processing';
    job.startedAt = Date.now();
    job.attempts += 1;

    let workDir: string | null = null;

    try {
      const ffmpeg = this.resolveFfmpegPath();
      workDir = await mkdtemp(join(tmpdir(), 'zcanopy-transcode-'));
      const extension = this.extensionFor(job.key);
      const inputPath = join(workDir, `input.${extension}`);
      const outputPath = join(workDir, 'output.mp4');
      const sourceBytes = await this.downloadWithRetry(job.key, inputPath);

      await this.runFfmpeg(ffmpeg, inputPath, outputPath);

      const { size } = await stat(outputPath);
      if (size < 1024) {
        throw new Error('ffmpeg produced an empty output file');
      }

      // Replace the original object so the URL the broker already received
      // starts serving the optimised file. `video/mp4` is set explicitly so
      // sources uploaded as `.mov` are still treated as MP4 by browsers.
      await this.spaces.replaceObjectFromFile(job.key, outputPath, 'video/mp4');

      job.status = 'done';
      job.finishedAt = Date.now();

      const seconds = Math.round((job.finishedAt - job.startedAt) / 1000);
      this.logger.log(
        `Transcoded ${job.key}: ${(sourceBytes / MB).toFixed(1)} MB -> ` +
          `${(size / MB).toFixed(1)} MB in ${seconds}s`,
      );
    } catch (error) {
      job.status = 'failed';
      job.finishedAt = Date.now();
      job.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`Transcode failed for ${job.key}: ${job.error}`);
    } finally {
      if (workDir) {
        await rm(workDir, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  }

  /**
   * Object stores are usually read-after-write consistent, but a freshly
   * uploaded key occasionally 404s for a moment. Retry briefly instead of
   * failing the job and leaving the large original in place.
   */
  private async downloadWithRetry(
    key: string,
    destination: string,
    attempts = 3,
  ): Promise<number> {
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await this.spaces.downloadToFile(
          key,
          destination,
          this.maxSourceBytes,
        );
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1)),
          );
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private runFfmpeg(
    ffmpeg: string,
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inputPath,
      // Keep the first video/optional audio track and drop subtitles/data so
      // phone recordings with junk streams do not break the MP4 muxer.
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-sn',
      '-dn',
      // Fit inside a 1920x1920 box without upscaling; even dimensions are
      // required by H.264. yuv420p is the widest playing pixel format.
      '-vf',
      "scale=w='if(gt(iw,1920),1920,iw)':h='if(gt(ih,1920),1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
      '-c:v',
      'libx264',
      '-preset',
      this.preset,
      '-crf',
      '23',
      '-maxrate',
      this.maxRate,
      '-bufsize',
      this.bufferSize,
      '-profile:v',
      'high',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ac',
      '2',
      '-ar',
      '44100',
      // Move the moov atom to the front so playback can start before the
      // whole file has downloaded.
      '-movflags',
      '+faststart',
      '-max_muxing_queue_size',
      '1024',
      '-f',
      'mp4',
      outputPath,
    ];

    return new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpeg, args, { windowsHide: true });
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, this.jobTimeoutMs);
      // Do not keep the process alive solely for the timeout timer.
      timer.unref?.();

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(
            new Error(
              `Transcode timed out after ${Math.round(this.jobTimeoutMs / 1000)}s`,
            ),
          );
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`),
        );
      });
    });
  }

  private resolveFfmpegPath(): string {
    if (this.ffmpegPath) return this.ffmpegPath;

    const configured = this.configService.get<string>('FFMPEG_PATH');
    if (configured && existsSync(configured)) {
      this.ffmpegPath = configured;
      return configured;
    }

    try {
      // `ffmpeg-static` ships a platform-specific binary, so Railway does not
      // need a system-level ffmpeg install. Keep it as a runtime require so
      // webpack leaves it external instead of trying to bundle the binary.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const resolved: unknown = require('ffmpeg-static');
      const candidate =
        typeof resolved === 'string'
          ? resolved
          : (resolved as { default?: string } | null)?.default;

      if (candidate && existsSync(candidate)) {
        this.ffmpegPath = candidate;
        return candidate;
      }

      this.logger.warn(
        `ffmpeg-static did not resolve to an existing binary (${String(candidate)}); falling back to "ffmpeg" on PATH`,
      );
    } catch (error) {
      this.logger.warn(
        `ffmpeg-static is unavailable (${error instanceof Error ? error.message : String(error)}); falling back to "ffmpeg" on PATH`,
      );
    }

    // Last resort: a system ffmpeg. If it is missing too, the job fails and
    // the client keeps the original upload.
    this.ffmpegPath = 'ffmpeg';
    return this.ffmpegPath;
  }

  private assertVideoKey(key: string): string {
    if (typeof key !== 'string' || !key.trim()) {
      throw new BadRequestException('key is required');
    }

    const normalized = key.trim().replace(/^\/+/, '');
    if (
      normalized.includes('..') ||
      normalized.includes('\\') ||
      !normalized.startsWith('properties/')
    ) {
      throw new BadRequestException('Invalid media key');
    }

    const rawExtension =
      normalized.split('?')[0].split('.').pop()?.toLowerCase() || '';
    if (!VIDEO_EXTENSIONS.has(rawExtension)) {
      throw new BadRequestException('Only video uploads can be transcoded');
    }

    return normalized;
  }

  private extensionFor(key: string): string {
    const withoutQuery = key.split('?')[0];
    const extension = withoutQuery.split('.').pop()?.toLowerCase() || '';
    return VIDEO_EXTENSIONS.has(extension) ? extension : 'mp4';
  }

  private positiveInt(name: string, fallback: number, minimum: number): number {
    const raw = this.configService.get<string>(name);
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed)) return fallback;
    return Math.max(minimum, Math.floor(parsed));
  }

  private prune(maxAgeMs = 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [jobId, job] of this.jobs) {
      if (job.status === 'queued' || job.status === 'processing') continue;
      const finishedAt = job.finishedAt ?? job.createdAt;
      if (finishedAt < cutoff) {
        this.jobs.delete(jobId);
      }
    }
  }
}
