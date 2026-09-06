/**
 * Seed subjects for the Procurement Insight pillar. This pillar has no
 * Tenderwize DB signal to detect a pattern from (see X_POSTS_GUIDELINES.md
 * "Procurement Insight" — it's evergreen expertise, not live data), so
 * without a candidate list the old approach just asked the model to "think
 * of a tip" on every generation — the same "explore yourself" failure mode
 * the other pillars fixed with detect-first pattern detection, just for
 * topic choice instead of data. Rotating through a curated list here gives
 * the same structural variety guarantee without needing anything to detect.
 *
 * Every entry is one concrete, tactical lesson (never a vague theme like
 * "communication is key") — specific enough that the model has a real
 * example to write about rather than free-associating a generic platitude.
 * Keep this list append-only: a bad entry here is a bad post waiting to
 * happen every time it's rotated back in.
 */
export const PROCUREMENT_INSIGHT_TOPICS: string[] = [
  'Why keyword-only search misses relevant tenders and CPV/category search catches more',
  'The difference between a framework agreement and a Dynamic Purchasing System, and why it changes how you bid',
  'How award criteria weighting (MEAT vs. lowest price) actually decides who wins',
  'The most common technical reasons bids get disqualified before price is even compared',
  'What an abnormally low tender price investigation actually checks for',
  'Why a Prior Information Notice (PIN) is worth watching before a tender is even published',
  'How sub-contracting declarations work and why omitting one can void a bid',
  'The standstill period after contract award and what remedies bidders actually have',
  'Joint bids and consortiums: when teaming up helps you meet minimum requirements',
  'Why some public contracts are legally reserved for social enterprises or sheltered workshops',
  'How threshold values determine which procurement procedure applies to a contract',
  'The difference between open procedure and restricted/negotiated procedure, and what it means for your odds',
  'Why variant bids are sometimes allowed and sometimes explicitly forbidden',
  'How mini-competitions under an existing framework agreement actually work',
  'What buyers are and are not allowed to ask for in a pre-market consultation',
  'Common ESPD (European Single Procurement Document) mistakes that get bids rejected on formalities',
  'Why performance guarantees and bid bonds trip up first-time public sector bidders',
  'How CPV code structure (division/group/class/category) actually works and why picking the wrong one buries your tender in search results',
  'What "economically most advantageous tender" legally requires buyers to disclose about their scoring',
  'Why missing a submission deadline by minutes disqualifies a bid with no exceptions',
];
