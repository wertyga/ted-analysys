import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Types } from 'mongoose';
import { EmailService } from '@/resources/email/email.service';
import { EMAIL_TEMPLATES } from '@/resources/email/type';
import {
  AiFitDecision,
  AiFitStatus,
} from '@/resources/tender-matching/tender-match.types';
import {
  TenderCompanyMatchDocument,
  TenderCompanyMatchModel,
} from '@/resources/tender-matching/schemas/tender-company-match.schema';
import { TenderDocument } from '@/resources/tenders/schemas';
import {
  TUserNotificationSettings,
  UserDocument,
  UserNotificationFrequency,
} from '@/resources/user/user.types';
import { UserModel } from '@/resources/user/user.schema';
import { getSafeErrorMessage, isDuplicateKeyError, logger } from '@/utils';
import { TenderMatchNotificationLogModel } from './schemas';

const DAILY_TENDER_MATCH_NOTIFICATIONS_CRON = '0 8 * * *';
const WEEKLY_TENDER_MATCH_NOTIFICATIONS_CRON = '0 8 * * 1';

type NotifiableFrequency =
  | UserNotificationFrequency.INSTANT
  | UserNotificationFrequency.DAILY
  | UserNotificationFrequency.WEEKLY;

type PopulatedTenderMatch = TenderCompanyMatchDocument & {
  tender: TenderDocument;
};

@Injectable()
export class TenderMatchNotificationsService {
  private readonly nestLogger = new Logger(TenderMatchNotificationsService.name);
  private isSendingDailyReports = false;
  private isSendingWeeklyReports = false;

  constructor(private readonly emailService: EmailService) {}

  async handleMatchReady(
    match: TenderCompanyMatchDocument | null,
  ): Promise<void> {
    if (!match?.aiFitDecision) {
      return;
    }

    const user = await UserModel.findById(match.company)
      .select('email companyName notifications')
      .exec();
    const frequency = this.getNotificationFrequency(
      user?.notifications,
      match.aiFitDecision,
    );

    if (!user || frequency !== UserNotificationFrequency.INSTANT) {
      return;
    }

    const populatedMatch = await TenderCompanyMatchModel.findById(match._id)
      .populate('tender')
      .exec();

    if (!this.isPopulatedTenderMatch(populatedMatch)) {
      return;
    }

    await this.sendReport(user, [populatedMatch], frequency);
  }

  @Cron(DAILY_TENDER_MATCH_NOTIFICATIONS_CRON, {
    timeZone: 'Europe/Warsaw',
  })
  async sendDailyReportsCron(): Promise<void> {
    if (this.isSendingDailyReports) {
      this.nestLogger.warn('Daily tender match reports are already running');
      return;
    }

    this.isSendingDailyReports = true;

    try {
      await this.sendBatchReports(UserNotificationFrequency.DAILY);
    } catch (error: unknown) {
      this.nestLogger.error(
        `Daily tender match reports failed: ${getSafeErrorMessage(error)}`,
      );
      await logger.error(
        'TENDER_MATCH_DAILY_NOTIFICATIONS_FAILED',
        getSafeErrorMessage(error),
      );
    } finally {
      this.isSendingDailyReports = false;
    }
  }

  @Cron(WEEKLY_TENDER_MATCH_NOTIFICATIONS_CRON, {
    timeZone: 'Europe/Warsaw',
  })
  async sendWeeklyReportsCron(): Promise<void> {
    if (this.isSendingWeeklyReports) {
      this.nestLogger.warn('Weekly tender match reports are already running');
      return;
    }

    this.isSendingWeeklyReports = true;

    try {
      await this.sendBatchReports(UserNotificationFrequency.WEEKLY);
    } catch (error: unknown) {
      this.nestLogger.error(
        `Weekly tender match reports failed: ${getSafeErrorMessage(error)}`,
      );
      await logger.error(
        'TENDER_MATCH_WEEKLY_NOTIFICATIONS_FAILED',
        getSafeErrorMessage(error),
      );
    } finally {
      this.isSendingWeeklyReports = false;
    }
  }

  private async sendBatchReports(frequency: NotifiableFrequency): Promise<void> {
    const users = await UserModel.find({
      $or: this.getNotificationDecisionFields()
        .map((decision) => ({ [`notifications.${decision}`]: frequency })),
    })
      .select('email companyName notifications')
      .exec();

    for (const user of users) {
      const decisions = this.getDecisionsForFrequency(
        user.notifications,
        frequency,
      );

      if (decisions.length === 0) {
        continue;
      }

      const matches = await this.findUnsentMatches(user._id, decisions);

      if (matches.length === 0) {
        continue;
      }

      await this.sendReport(user, matches, frequency);
    }
  }

  private async findUnsentMatches(
    userId: Types.ObjectId | string,
    decisions: AiFitDecision[],
  ): Promise<PopulatedTenderMatch[]> {
    const sentLogs = await TenderMatchNotificationLogModel.find({
      user: userId,
    })
      .select('match')
      .lean()
      .exec();
    const sentMatchIds = sentLogs.map((log) => log.match);
    const matches = await TenderCompanyMatchModel.find({
      company: userId,
      aiFitStatus: AiFitStatus.COMPLETED,
      aiFitDecision: { $in: decisions },
      ...(sentMatchIds.length > 0 ? { _id: { $nin: sentMatchIds } } : {}),
    })
      .sort({ aiFitScore: -1, updatedAt: -1 })
      .populate('tender')
      .exec();

    return matches.filter((match) =>
      this.isPopulatedTenderMatch(match),
    ) as unknown as PopulatedTenderMatch[];
  }

  private async sendReport(
    user: UserDocument,
    matches: PopulatedTenderMatch[],
    frequency: NotifiableFrequency,
  ): Promise<void> {
    await this.emailService.sendEmailToUser(
      EMAIL_TEMPLATES.TenderMatchReport,
      user.email,
      this.buildSubject(matches, frequency),
      {
        companyName: user.companyName || 'there',
        reportTitle: this.buildReportTitle(matches, frequency),
        matchesHtml: this.buildMatchesHtml(matches),
      },
    );

    await this.createLogs(user, matches, frequency);
    await logger.info('TENDER_MATCH_NOTIFICATION_SENT', {
      userId: String(user._id),
      frequency,
      matchesCount: matches.length,
    });
  }

  private async createLogs(
    user: UserDocument,
    matches: PopulatedTenderMatch[],
    frequency: NotifiableFrequency,
  ): Promise<void> {
    const sentAt = new Date();

    try {
      await TenderMatchNotificationLogModel.insertMany(
        matches.map((match) => ({
          user: user._id,
          match: match._id,
          tender: match.tender._id,
          aiFitDecision: match.aiFitDecision,
          frequency,
          sentAt,
        })),
        { ordered: false },
      );
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  private getNotificationFrequency(
    notifications: TUserNotificationSettings | undefined,
    decision: AiFitDecision,
  ): UserNotificationFrequency | undefined {
    if (decision === AiFitDecision.REJECT) {
      return undefined;
    }

    return notifications?.[decision];
  }

  private getDecisionsForFrequency(
    notifications: TUserNotificationSettings | undefined,
    frequency: NotifiableFrequency,
  ): AiFitDecision[] {
    return this.getNotificationDecisionFields().filter(
      (decision) => notifications?.[decision] === frequency,
    );
  }

  private getNotificationDecisionFields(): Array<
    Exclude<AiFitDecision, AiFitDecision.REJECT>
  > {
    return [
      AiFitDecision.MAYBE,
      AiFitDecision.GOOD_FIT,
      AiFitDecision.STRONG_FIT,
    ];
  }

  private buildSubject(
    matches: PopulatedTenderMatch[],
    frequency: NotifiableFrequency,
  ): string {
    return this.buildReportTitle(matches, frequency);
  }

  private buildReportTitle(
    matches: PopulatedTenderMatch[],
    frequency: NotifiableFrequency,
  ): string {
    const prefix =
      frequency === UserNotificationFrequency.INSTANT
        ? 'New matching tender'
        : 'Matching tender report';

    return `${prefix}: ${matches.length} tender${matches.length === 1 ? '' : 's'}`;
  }

  private buildMatchesHtml(matches: PopulatedTenderMatch[]): string {
    return matches
      .map((match) => {
        const tender = match.tender;
        const title = this.escapeHtml(tender.title || tender.id);
        const buyer = tender.buyerName
          ? `<p><strong>Buyer:</strong> ${this.escapeHtml(tender.buyerName)}</p>`
          : '';
        const deadline = tender.submissionDeadline ?? tender.deadlineReceiptTender;
        const deadlineText = deadline
          ? `<p><strong>Deadline:</strong> ${deadline.toISOString().slice(0, 10)}</p>`
          : '';

        return [
          '<li>',
          `<h4>${title}</h4>`,
          `<p><strong>TED id:</strong> ${this.escapeHtml(tender.id)}</p>`,
          `<p><strong>AI fit:</strong> ${match.aiFitScore ?? 'n/a'} (${this.escapeHtml(match.aiFitDecision ?? 'n/a')})</p>`,
          match.aiFitSummary
            ? `<p>${this.escapeHtml(match.aiFitSummary)}</p>`
            : '',
          buyer,
          deadlineText,
          '</li>',
        ].join('');
      })
      .join('');
  }

  private isPopulatedTenderMatch(
    match: TenderCompanyMatchDocument | null,
  ): match is PopulatedTenderMatch {
    return !!match?.tender && typeof match.tender === 'object';
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
