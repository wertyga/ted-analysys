import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';

/**
 * Shared service account auth for Google APIs. Each API module passes its
 * own read-only scope, so a module only gets the access it actually uses.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly authByScope = new Map<string, GoogleAuth>();

  constructor(private readonly configService: ConfigService) {}

  async post<T>(scope: string, url: string, data: unknown): Promise<T> {
    const client = await this.getAuth(scope).getClient();

    try {
      const response = await client.request<T>({ url, method: 'POST', data });

      return response.data;
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ??
        (error instanceof Error ? error.message : String(error));

      this.logger.warn(`Google API request to ${url} failed: ${message}`);
      throw new ServiceUnavailableException(`Google API error: ${message}`);
    }
  }

  private getAuth(scope: string): GoogleAuth {
    const cached = this.authByScope.get(scope);

    if (cached) {
      return cached;
    }

    const keyFile = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
    );
    const keyJson = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_JSON',
    );

    if (!keyFile && !keyJson) {
      throw new ServiceUnavailableException(
        'Google credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_JSON.',
      );
    }

    const auth = new GoogleAuth({
      scopes: [scope],
      ...(keyJson
        ? { credentials: JSON.parse(keyJson) }
        : { keyFile: keyFile as string }),
    });

    this.authByScope.set(scope, auth);

    return auth;
  }
}
