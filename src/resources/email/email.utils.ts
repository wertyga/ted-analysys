import { EMAIL_TEMPLATES } from './type';
import * as fs from 'fs';
import * as path from 'path';

const emailVariables = {
  brandName: '{{brandName}}',
  companyName: '{{companyName}}',
  confirmLink: '{{confirmLink}}',
  origin: '{{origin}}',
  recoveryToken: '{{recoveryToken}}',

  amount: '{{amount}}',
  currency: '{{currency}}',
  date: '{{date}}',
  paymentId: '{{paymentId}}',
  receiptUrl: '{{receiptUrl}}',

  reportTitle: '{{reportTitle}}',
  highestScore: '{{highestScore}}',
  highlightedCount: '{{highlightedCount}}',
  matchesHtml: '{{matchesHtml}}',
  dashboardUrl: '{{dashboardUrl}}',
};

type TEmailTemplatesCompare = {
  [EMAIL_TEMPLATES.OauthRegistered]: 'companyName';
  [EMAIL_TEMPLATES.RestorePassword]: 'recoveryToken';
  [EMAIL_TEMPLATES.ConfirmEmail]: 'companyName' | 'confirmLink';
  [EMAIL_TEMPLATES.ConfirmedEmail]: 'companyName' | 'origin';
  [EMAIL_TEMPLATES.ErrorEmail]: undefined;
  [EMAIL_TEMPLATES.PaymentSuccess]:
    | 'companyName'
    | 'amount'
    | 'currency'
    | 'date'
    | 'paymentId'
    | 'receiptUrl';
  [EMAIL_TEMPLATES.TenderMatchReport]:
    | 'companyName'
    | 'reportTitle'
    | 'highestScore'
    | 'highlightedCount'
    | 'dashboardUrl'
    | 'matchesHtml';
};

export type EmailReplaceData<T extends EMAIL_TEMPLATES> = {
  [K in Extract<
    TEmailTemplatesCompare[T],
    keyof typeof emailVariables
  >]: string;
} & {
  brandName?: string;
};

export const getEmailBrandName = () => process.env.APP_NAME;

export const getEmailTemplate = (type: EMAIL_TEMPLATES) => {
  let filename = '';
  switch (type) {
    case EMAIL_TEMPLATES.ConfirmEmail:
      filename = 'confirm.html';
      break;
    case EMAIL_TEMPLATES.RestorePassword:
      filename = 'restorePassword.html';
      break;
    case EMAIL_TEMPLATES.PaymentSuccess:
      filename = 'paymentSuccess.html';
      break;
    case EMAIL_TEMPLATES.ConfirmedEmail:
      filename = 'emailConfirmed.html';
      break;
    case EMAIL_TEMPLATES.ErrorEmail:
      filename = 'ErrorEmail.html';
      break;
    case EMAIL_TEMPLATES.OauthRegistered:
      filename = 'oauthRegistered.html';
      break;
    case EMAIL_TEMPLATES.TenderMatchReport:
      filename = 'tenderMatchReport.html';
      break;

    default:
      break;
  }

  return fs
    .readFileSync(path.join(process.cwd(), `emailTemplates/${filename}`))
    .toString();
};

export const replaceTemplateVars = <T extends EMAIL_TEMPLATES>(
  template: T,
  data?: EmailReplaceData<T>,
) => {
  let stringTemplate = getEmailTemplate(template as EMAIL_TEMPLATES);

  Object.entries({ brandName: getEmailBrandName(), ...(data || {}) }).forEach(
    ([key, value]: [string, string]) => {
      const regExp = new RegExp(emailVariables[key], 'g');
      stringTemplate = stringTemplate.replace(regExp, value);
    },
  );

  return stringTemplate;
};
