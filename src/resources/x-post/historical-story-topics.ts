/**
 * Seed subjects for the Historical Story pillar. There is no Tenderwize DB
 * signal for "a famous historical procurement story" — these events mostly
 * predate or fall outside TED coverage — so instead of detecting a pattern
 * in our own data, the backend rotates through this curated list and hands
 * each candidate to WebEnrichmentService to find and verify real facts
 * before anything is written (see X_POSTS_GUIDELINES.md "Historical Story").
 *
 * Every entry here must be a real, well-documented public event — never a
 * vague theme the model would have to fill in from memory. Keep this list
 * append-only and reviewed: a bad entry here is a bad post waiting to
 * happen, since the whole pillar's credibility rests on these being
 * genuinely researchable, verifiable stories.
 */
export const HISTORICAL_STORY_TOPICS: string[] = [
  'Sydney Opera House construction cost overrun and contract history',
  'Denver International Airport automated baggage handling system failure',
  'Boston Big Dig (Central Artery/Tunnel Project) construction contracts',
  'UK Post Office Horizon IT system scandal',
  'Berlin Brandenburg Airport construction delays and contractor disputes',
  'Channel Tunnel construction financing and contractor consortium',
  'NASA Apollo program prime contractor network',
  'US Department of Defense spare parts procurement scandal 1980s',
  'F-35 Joint Strike Fighter program contract history',
  'London 2012 Olympics construction procurement program',
  'Hoover Dam construction contract won by Six Companies Inc',
  'US Interstate Highway System contracting model',
  'European Union Galileo satellite navigation program procurement',
  'UK HS2 high-speed rail procurement and contractor history',
  'Suez Canal construction contracts and financing',
  'Panama Canal construction contract history',
  'IBM 1890 US Census Bureau tabulating machine contract',
  'Concorde supersonic jet joint development and procurement program',
  'Fyre Festival vendor and contractor payment failures',
  'Boeing 787 Dreamliner supplier and procurement strategy',
];
