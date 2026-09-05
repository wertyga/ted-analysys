import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { ReactNode } from 'react';
import axios from 'axios';
import { CdnService } from '@/cdn';
import {
  buildXPostImageTree,
  X_POST_IMAGE_HEIGHT,
  X_POST_IMAGE_WIDTH,
  XPostImageInput,
} from './x-post-image.template';

@Injectable()
export class XPostImageService {
  private readonly logger = new Logger(XPostImageService.name);
  private readonly cdnService = new CdnService();
  private fontsCache?: Array<{
    name: string;
    data: Buffer;
    weight: 400 | 700;
    style: 'normal';
  }>;

  private getFonts() {
    if (!this.fontsCache) {
      const fontsDir = join(
        process.cwd(),
        'node_modules/@fontsource/inter/files',
      );

      this.fontsCache = [
        {
          name: 'Inter',
          data: readFileSync(join(fontsDir, 'inter-latin-400-normal.woff')),
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: readFileSync(join(fontsDir, 'inter-latin-700-normal.woff')),
          weight: 700,
          style: 'normal',
        },
      ];
    }

    return this.fontsCache;
  }

  async renderPng(input: XPostImageInput): Promise<Buffer> {
    const tree = buildXPostImageTree(input);
    const svg = await satori(tree as unknown as ReactNode, {
      width: X_POST_IMAGE_WIDTH,
      height: X_POST_IMAGE_HEIGHT,
      fonts: this.getFonts(),
    });
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: X_POST_IMAGE_WIDTH },
    });

    return Buffer.from(resvg.render().asPng());
  }

  async renderAndUpload(
    input: XPostImageInput,
    xPostId: string,
  ): Promise<string | undefined> {
    try {
      const png = await this.renderPng(input);

      return await this.cdnService.uploadFromBuffer(
        png,
        `${xPostId}.png`,
        'x-posts',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to render/upload X post image for ${xPostId}: ${this.describeError(
          error,
        )}`,
      );

      return undefined;
    }
  }

  private describeError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const body = error.response?.data;
      const bodyText =
        typeof body === 'string' ? body : body ? JSON.stringify(body) : '';
      const authHint =
        status === 401 || status === 403
          ? ' — check the DNS_STORAGE/DNS_PASSWORD/DNS_PREFIX env vars for the CDN (BunnyCDN storage credentials) on this server.'
          : '';

      return `CDN upload failed with HTTP ${status ?? 'unknown'}${bodyText ? `: ${bodyText}` : ''}${authHint}`;
    }

    return error instanceof Error ? error.message : String(error);
  }
}
