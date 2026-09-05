import { XPostPillar } from '../schemas/x-post.schema';

export const X_POST_IMAGE_WIDTH = 1200;
export const X_POST_IMAGE_HEIGHT = 675;

const BACKGROUND = '#0b1220';
const MUTED = '#8a94a6';

const PILLAR_META: Record<XPostPillar, { label: string; accent: string }> = {
  [XPostPillar.InterestingTender]: {
    label: 'INTERESTING TENDER',
    accent: '#ff7a59',
  },
  [XPostPillar.MarketInsight]: { label: 'MARKET INSIGHT', accent: '#5b9dff' },
  [XPostPillar.ContractAward]: { label: 'CONTRACT AWARD', accent: '#ffcf5c' },
  [XPostPillar.ProcurementInsight]: {
    label: 'PROCUREMENT INSIGHT',
    accent: '#b98cff',
  },
};

const DEFAULT_META = { label: 'TENDERWIZE', accent: '#5b9dff' };

export interface XPostImageInput {
  pillar?: XPostPillar;
  headline: string;
  isThread?: boolean;
}

type SatoriStyle = Record<string, string | number>;
export interface SatoriNode {
  type: string;
  props: {
    style?: SatoriStyle;
    children?: string | SatoriNode[];
  };
}

// No 'g' flag - a global regex's .test() mutates lastIndex across calls,
// which would make repeated filter() calls below skip matches unpredictably.
const URL_PATTERN = /https?:\/\/\S+/i;
// A CTA label line ("Explore the tender ↓") that's left dangling once the
// URL line after it gets stripped - short, and ends with the arrow.
const DANGLING_CTA_LABEL_PATTERN = /^.{0,60}[↓→]\s*$/;

/**
 * The card image can't make a URL clickable, so any link/CTA line in the
 * post text must never be rendered onto it - only the post's readable
 * value/hook content should show up here.
 */
function stripLinksForImage(text: string): string {
  const lines = text
    .split('\n')
    .filter((line) => !URL_PATTERN.test(line))
    .filter((line) => !DANGLING_CTA_LABEL_PATTERN.test(line.trim()));

  return lines.join('\n').trim();
}

function pickHeadlineFontSize(text: string): number {
  const length = text.length;

  if (length > 220) return 34;
  if (length > 160) return 40;
  if (length > 100) return 48;

  return 56;
}

export function buildXPostImageTree(input: XPostImageInput): SatoriNode {
  const meta = input.pillar ? PILLAR_META[input.pillar] : DEFAULT_META;
  // Fall back to the raw text in the unlikely case stripping leaves nothing
  // (e.g. a post that was somehow only a link) so the card is never blank.
  const headline = stripLinksForImage(input.headline) || input.headline;
  const fontSize = pickHeadlineFontSize(headline);

  return {
    type: 'div',
    props: {
      style: {
        width: `${X_POST_IMAGE_WIDTH}px`,
        height: `${X_POST_IMAGE_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        padding: '72px',
        background: BACKGROUND,
        color: '#ffffff',
        fontFamily: 'Inter',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              left: '0px',
              top: '0px',
              bottom: '0px',
              width: '14px',
              background: meta.accent,
              display: 'flex',
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: 2,
                    color: MUTED,
                  },
                  children: 'TENDERWIZE',
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 16 },
                  children: [
                    ...(input.isThread
                      ? [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: 20,
                                fontWeight: 700,
                                letterSpacing: 2,
                                color: MUTED,
                              },
                              children: 'THREAD',
                            },
                          } satisfies SatoriNode,
                        ]
                      : []),
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: 24,
                          fontWeight: 700,
                          letterSpacing: 1,
                          color: meta.accent,
                        },
                        children: meta.label,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize,
              fontWeight: 700,
              lineHeight: 1.25,
            },
            children: headline,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { fontSize: 22, color: MUTED },
                  children: 'tenderwize.com',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    width: '36px',
                    height: '10px',
                    background: meta.accent,
                    borderRadius: 6,
                    display: 'flex',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };
}
