import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as path from 'path';
import process from 'process';

export type TDeleteFileFromCDNByFilename = {
  filenameOrFilePath: string;
  prefixFolder: string;
  isPath?: undefined;
};
export type TDeleteFileFromCDNByUrl = {
  filenameOrFilePath: string;
  prefixFolder?: undefined;
  isPath: true;
};

export type CdnFile = {
  ObjectName: string;
  LastChanged?: string;
  DateCreated?: string;
  Length?: number;
};

@Injectable()
export class CdnService {
  private getStoragePathForUrl(url: string): string {
    const { DNS_STORAGE } = process.env;
    const urlPathParts = url.split(path.sep).slice(3);
    const storagePathParts =
      urlPathParts[0] === DNS_STORAGE ? urlPathParts.slice(1) : urlPathParts;

    return [
      'https://storage.bunnycdn.com',
      DNS_STORAGE,
      ...storagePathParts, // Remove 'https:', '', '<cdn-domain>', and optional storage zone.
    ].join(path.sep);
  }

  private normalizePrefixFolder(prefixFolder = '') {
    const normalizedPrefix = prefixFolder.replace(/^\/+|\/+$/g, '');

    return normalizedPrefix ? `/${normalizedPrefix}` : '';
  }

  async deleteFileFromCdn({
    filenameOrFilePath,
    prefixFolder,
    isPath,
  }: TDeleteFileFromCDNByFilename | TDeleteFileFromCDNByUrl) {
    try {
      if (!filenameOrFilePath) {
        return;
      }

      if (isPath && !filenameOrFilePath.includes('.b-cdn.net')) {
        return;
      }

      const { DNS_STORAGE, DNS_PASSWORD } = process.env;
      const normalizedPrefix = this.normalizePrefixFolder(prefixFolder);
      const url = isPath
        ? this.getStoragePathForUrl(filenameOrFilePath)
        : `https://storage.bunnycdn.com/${DNS_STORAGE}${normalizedPrefix}/${filenameOrFilePath}`;

      await axios({
        method: 'delete',
        url,
        headers: {
          AccessKey: DNS_PASSWORD,
        },
      });
    } catch (e) {
      console.log('deleteFileFromCdn: ', filenameOrFilePath, e.message);
    }
  }

  async listFiles(prefixFolder = ''): Promise<CdnFile[]> {
    const { DNS_STORAGE, DNS_PASSWORD } = process.env;
    const normalizedPrefix = this.normalizePrefixFolder(prefixFolder);
    const url = `https://storage.bunnycdn.com/${DNS_STORAGE}${normalizedPrefix}/`;

    const response = await axios<CdnFile[]>({
      method: 'get',
      url,
      headers: {
        AccessKey: DNS_PASSWORD,
      },
    });

    return response.data;
  }

  async uploadFromBuffer(buffer: Buffer, filename: string, prefixFolder = '') {
    const { DNS_STORAGE, DNS_PASSWORD, DNS_PREFIX } = process.env;
    const normalizedPrefix = this.normalizePrefixFolder(prefixFolder);
    const url = `https://storage.bunnycdn.com/${DNS_STORAGE}${normalizedPrefix}/${filename}`;

    await axios({
      method: 'put',
      url,
      headers: {
        AccessKey: DNS_PASSWORD,
      },
      data: buffer,
    });

    return `${DNS_PREFIX}/${DNS_STORAGE}${normalizedPrefix}/${filename}`;
  }
}
