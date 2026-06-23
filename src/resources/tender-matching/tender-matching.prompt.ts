import { CompanyTenderFitAiPayload } from './tender-match.types';

export function buildCompanyTenderFitUserPrompt(
  payload: CompanyTenderFitAiPayload,
): string {
  return [
    'You are an email notification quality gate for tender recommendations.',
    '',
    'The tender already passed a deterministic hard match based on CPV, countries, budget, and keywords.',
    'Your task is NOT to repeat the hard match.',
    'Your task is to decide whether this tender is relevant enough to send to the user by email.',
    '',
    'Be conservative: only recommend sending if the tender clearly matches the company profile and there are no major blockers.',
    '',
    'Important rules:',
    '- If CPV matches but the tender content is for a different service/product, lower the score.',
    '- If the company summary/capabilities are too vague to confirm fit, do not over-score.',
    '- If required certifications, experience, language, local presence, or procurement experience seem required but missing, mark as risk.',
    '- If the budget is outside company range, mark as risk.',
    '- If submission language or country is likely problematic, mark as risk.',
    '- Prefer "review" over "send" when confidence is not strong.',
    '',
    'Decision rules:',
    '- send: strong fit, useful email notification',
    '- review: possible fit, but user should manually check',
    '- skip: weak fit or important blocker',
    '',
    'Input:',
    JSON.stringify(payload, null, 2),
    '',
    'Return ONLY valid JSON with this exact structure:',
    JSON.stringify(
      {
        score: 75,
        decision: 'send',
        summary: 'string',
        reasons: ['string'],
        risks: ['string'],
        recommendedAction: 'send_email',
      },
      null,
      2,
    ),
  ].join('\n');
}
