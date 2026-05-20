import {
  All,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiDefaultResponse,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '@/guards';
import { HttpErrorLoggingFilter } from '@/http-logger/HTTPLogger';
import { FreemiusService } from './freemius.service';
import {
  CancelFreemiusSubscriptionDto,
  ChangeFreemiusSubscriptionDto,
  CreateFreemiusCheckoutDto,
  FreemiusCheckoutPurchaseDto,
  FreemiusCheckoutResponseDto,
  FreemiusEntitlementResponseDto,
  FreemiusWebhookResponseDto,
} from './dto/freemius.dto';

@ApiTags('Freemius')
@UseFilters(HttpErrorLoggingFilter)
@Controller('/freemius')
export class FreemiusController {
  constructor(private readonly freemiusService: FreemiusService) {}

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create Freemius checkout',
    description:
      'Creates a checkout for a new purchase. If the user already has an active subscription, use /freemius/subscription/change-checkout instead.',
  })
  @ApiBody({ type: CreateFreemiusCheckoutDto })
  @ApiOkResponse({ type: FreemiusCheckoutResponseDto })
  @ApiBadRequestResponse({
    description:
      'Missing Freemius config, invalid request, or user already has an active subscription.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @UseGuards(AuthGuard)
  @Post('/checkout')
  async createCheckout(@Req() req, @Body() body: CreateFreemiusCheckoutDto) {
    return this.freemiusService.createCheckout(req.user, body ?? {});
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get active Freemius entitlement',
    description:
      'Returns the active local Freemius subscription entitlement for the authenticated user.',
  })
  @ApiOkResponse({ type: FreemiusEntitlementResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @UseGuards(AuthGuard)
  @Get('/entitlement')
  async getEntitlement(@Req() req) {
    return {
      entitlement: await this.freemiusService.getActiveEntitlement(req.user),
    };
  }

  @ApiOperation({
    summary: 'Get public Freemius pricing',
    description:
      'Returns product pricing table data from Freemius. This endpoint is public so pricing can be shown before login.',
  })
  @ApiOkResponse({
    description: 'Freemius pricing data. Shape is owned by Freemius SDK.',
  })
  @Get('/pricing')
  async getPricing() {
    return this.freemiusService.getPricing();
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get Freemius customer portal data',
    description:
      'Returns Customer Portal data for the authenticated user: subscriptions, plans, payments, billing and signed action URLs.',
  })
  @ApiOkResponse({
    description:
      'Freemius Customer Portal data. Shape is owned by Freemius SDK.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @UseGuards(AuthGuard)
  @Get('/customer-portal')
  async getCustomerPortal(@Req() req: Request) {
    return this.freemiusService.getCustomerPortal(
      req.user,
      this.getRequestUrl(req, '/freemius/customer-portal/action'),
    );
  }

  @ApiOperation({
    summary: 'Process Freemius customer portal signed action',
    description:
      'Public signed-action endpoint used by Freemius Customer Portal URLs for billing, invoices, cancellation coupon, cancellation and restore purchase actions.',
  })
  @ApiDefaultResponse({
    description:
      'Proxies the Response returned by Freemius SDK action processor.',
  })
  @All('/customer-portal/action')
  async processCustomerPortalAction(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const response = await this.freemiusService.processCustomerPortalAction(
      this.createFetchRequest(req),
    );

    return this.sendFetchResponse(res, response);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create checkout for subscription change',
    description:
      'Creates an upgrade/downgrade/change checkout for the authenticated user active subscription. Uses the existing Freemius license ID and authorization so Freemius applies upgrade flow/proration.',
  })
  @ApiBody({ type: ChangeFreemiusSubscriptionDto })
  @ApiOkResponse({ type: FreemiusCheckoutResponseDto })
  @ApiBadRequestResponse({
    description: 'No active subscription, invalid plan, or Freemius API error.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @UseGuards(AuthGuard)
  @Post('/subscription/change-checkout')
  async createSubscriptionChangeCheckout(
    @Req() req,
    @Body() body: ChangeFreemiusSubscriptionDto,
  ) {
    return this.freemiusService.createSubscriptionChangeCheckout(
      req.user,
      body,
    );
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel active Freemius subscription',
    description:
      'Cancels the authenticated user active Freemius subscription through Freemius API and refreshes local entitlement state.',
  })
  @ApiBody({ type: CancelFreemiusSubscriptionDto })
  @ApiOkResponse({
    description: 'Freemius subscription cancellation response.',
  })
  @ApiBadRequestResponse({
    description: 'No active subscription or Freemius cancellation failed.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @UseGuards(AuthGuard)
  @Post('/subscription/cancel')
  async cancelSubscription(
    @Req() req,
    @Body() body: CancelFreemiusSubscriptionDto,
  ) {
    return this.freemiusService.cancelSubscription(req.user, body ?? {});
  }

  @ApiOperation({
    summary: 'Process Freemius checkout purchase callback',
    description:
      'Processes overlay checkout success payload. Backend verifies purchase by license ID via Freemius API before saving entitlement.',
  })
  @ApiBody({ type: FreemiusCheckoutPurchaseDto })
  @ApiOkResponse({ type: FreemiusEntitlementResponseDto })
  @ApiBadRequestResponse({
    description: 'Missing or invalid Freemius license ID.',
  })
  @Post('/purchase')
  async processCheckoutPurchase(@Body() body: unknown) {
    return {
      entitlement: await this.freemiusService.processCheckoutPurchase(
        body as never,
      ),
    };
  }

  @ApiOperation({
    summary: 'Process hosted checkout redirect',
    description:
      'Handles Freemius hosted checkout redirect, verifies redirect signature and syncs entitlement.',
  })
  @ApiOkResponse({ type: FreemiusEntitlementResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid redirect signature or missing Freemius license ID.',
  })
  @Get('/process-purchase')
  async processHostedCheckoutRedirect(@Req() req: Request) {
    return {
      entitlement: await this.freemiusService.processRedirect(
        this.getRequestUrl(req),
        process.env.FREEMIUS_PROXY_URL,
      ),
    };
  }

  @ApiOperation({
    summary: 'Process Freemius webhook',
    description:
      'Public webhook endpoint for Freemius. Signature is verified with x-signature over raw body. Handles license/subscription events and ignores non-entitlement events.',
  })
  @ApiOkResponse({ type: FreemiusWebhookResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed webhook payload.' })
  @Post('/webhook')
  async processWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const result = await this.freemiusService.processWebhook(
      req.headers,
      req.rawBody ?? JSON.stringify(req.body ?? {}),
    );

    console.log({ result });

    return res.status(result.status).json(result);
  }

  private getRequestUrl(req: Request, pathname?: string) {
    const protocol =
      this.getForwardedHeader(req, 'x-forwarded-proto') ?? req.protocol;
    const host =
      this.getForwardedHeader(req, 'x-forwarded-host') ?? req.get('host');

    return `${protocol}://${host}${pathname ?? req.originalUrl}`;
  }

  private getForwardedHeader(req: Request, header: string) {
    const value = req.headers[header];

    if (Array.isArray(value)) {
      return value[0];
    }

    return value?.split(',')[0]?.trim();
  }

  private createFetchRequest(req: RawBodyRequest<Request>) {
    const body =
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : (req.rawBody ?? JSON.stringify(req.body ?? {}));

    return new Request(this.getRequestUrl(req), {
      method: req.method,
      headers: this.createFetchHeaders(req),
      body: Buffer.isBuffer(body) ? body.toString('utf8') : body,
    });
  }

  private createFetchHeaders(req: Request) {
    const headers = new Headers();

    Object.entries(req.headers).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => headers.append(key, item));
        return;
      }

      if (value) {
        headers.set(key, value);
      }
    });

    return headers;
  }

  private async sendFetchResponse(
    res: Response,
    response: globalThis.Response,
  ) {
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const body = Buffer.from(await response.arrayBuffer());

    return res.status(response.status).send(body);
  }
}
