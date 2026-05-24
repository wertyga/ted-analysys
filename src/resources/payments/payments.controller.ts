import {
  Body,
  Controller,
  Get,
  Post,
  Query,
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
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '@/guards';
import { HttpErrorLoggingFilter } from '@/http-logger/HTTPLogger';
import { PaymentsService } from './payments.service';
import {
  CancelPaymentSubscriptionDto,
  CreatePaymentCheckoutDto,
  GetPaymentListDto,
  PaymentCheckoutPurchaseDto,
  PaymentCheckoutResponseDto,
  PaymentEntitlementResponseDto,
  PaymentListResponseDto,
  PaymentWebhookResponseDto,
} from './dto/payments.dto';
import { PaymentsWebhookService } from '@/resources/payments/payments.webhook.service';

@ApiTags('Payments')
@UseFilters(HttpErrorLoggingFilter)
@Controller('/payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private paymentsWebhookService: PaymentsWebhookService,
  ) {}

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create Freemius checkout',
    description:
      'Creates the correct Freemius overlay checkout for a new subscription, reactivation, upgrade, or downgrade.',
  })
  @ApiBody({ type: CreatePaymentCheckoutDto })
  @ApiOkResponse({ type: PaymentCheckoutResponseDto })
  @ApiBadRequestResponse({
    description:
      'Missing Freemius config, invalid request, or user already has an active subscription.',
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @UseGuards(AuthGuard)
  @Post('/checkout')
  async createCheckout(@Req() req, @Body() body: CreatePaymentCheckoutDto) {
    const checkout = await this.paymentsService.createCheckout(req.user, body);

    return checkout;
  }

  @ApiOperation({
    summary: 'Process Freemius checkout purchase callback',
    description:
      'Processes overlay checkout success payload. Backend verifies purchase by license ID via Freemius API before saving entitlement.',
  })
  @ApiBody({ type: PaymentCheckoutPurchaseDto })
  @ApiOkResponse({ type: PaymentEntitlementResponseDto })
  @ApiBadRequestResponse({
    description: 'Missing or invalid Freemius license ID.',
  })
  @Get('/purchase')
  async processCheckoutPurchase(@Query('licenseId') licenseId: string) {
    return {
      entitlement: await this.paymentsService.getCheckout(licenseId),
    };
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get active Freemius entitlement',
    description:
      'Returns the active local Freemius subscription entitlement for the authenticated user.',
  })
  @ApiOkResponse({ type: PaymentEntitlementResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @UseGuards(AuthGuard)
  @Get('/entitlement')
  async getEntitlement(@Req() req) {
    return {
      entitlement: await this.paymentsService.getUserEntitlement(req.user),
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
    return this.paymentsService.getPricingList();
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List Freemius payments',
    description:
      'Returns the authenticated user payment history directly from Freemius.',
  })
  @ApiOkResponse({ type: PaymentListResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or invalid.',
  })
  @UseGuards(AuthGuard)
  @Get('/list')
  async getPayments(@Req() req, @Query() query: GetPaymentListDto) {
    return {
      payments: await this.paymentsService.getPayments(req.user, query),
    };
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel active Freemius subscription',
    description:
      'Cancels the authenticated user active Freemius subscription through Freemius API and refreshes local entitlement state.',
  })
  @ApiBody({ type: CancelPaymentSubscriptionDto })
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
  async cancelSubscription(@Req() req) {
    return this.paymentsService.cancelSubscription(req.user);
  }

  @ApiOperation({
    summary: 'Process Freemius webhook',
    description:
      'Public webhook endpoint for Freemius. Signature is verified with x-signature over raw body. Handles license/subscription events and ignores non-entitlement events.',
  })
  @ApiOkResponse({ type: PaymentWebhookResponseDto })
  @ApiBadRequestResponse({ description: 'Malformed webhook payload.' })
  @Post('/webhook')
  async processWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    const result = await this.paymentsWebhookService.processWebhook(
      req.headers,
      req.rawBody ?? JSON.stringify(req.body ?? {}),
    );

    return res.status(result.status).json(result);
  }
}
