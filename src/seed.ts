import { pathToFileURL } from 'node:url';
import { close, connect, portals as portalsCol, settings as settingsCol } from './db.js';
import type { Portal, Settings } from './types.js';
import { DEFAULT_ACTIVE_HOURS, describeActiveHours } from './util/activeHours.js';

export const settingsSeed: Settings = {
  activeHours: DEFAULT_ACTIVE_HOURS,
  globalPrompt:
    'You are a job-matching assistant. Given a candidate position description and a job listing, ' +
    'decide whether the listing is a genuine fit. Be strict and only mark suitable when ALL hard ' +
    'requirements in the position description are satisfied. If a requirement cannot be confirmed ' +
    'from the listing, treat it as not satisfied.',
  positionDescription:
    'I am looking for INTERNSHIP positions (intern / stage / tirocinio / working-student) in ' +
    'software engineering, software development, research engineering, or research — or closely ' +
    'related technical roles.\n\n' +
    'Hard requirements — mark suitable only if ALL hold:\n' +
    '1. Role is an internship / intern-level position (not a full-time senior or permanent role).\n' +
    '2. Location is in EUROPE (EU/EEA/UK/Switzerland), or remote within Europe. Reject roles ' +
    'based outside Europe (e.g. US, Canada, Asia, Middle East, etc.).\n' +
    '3. Education: the role must NOT strictly require a PhD. A Master\'s degree requirement (or ' +
    '"currently pursuing a Master") is acceptable. If it says "PhD or Master" (either accepted), ' +
    'that is fine. Reject only when a PhD is mandatory with no Master alternative.\n\n' +
    'Not interested in non-technical roles (sales, marketing, HR, etc.).',
};

export const portalsSeed: Portal[] = [
  {
    // amazon.jobs public search API: base_query=intern + European country codes.
    // Full descriptions inline; newest-first crawl that stops at the first job
    // already stored for this portal. See src/sources/amazon.ts.
    name: 'Amazon',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'amazon'
  },
  {
    // lifeatspotify.com engineering category, intern-titled roles. List-only (no
    // descriptions); the LLM judge applies the Europe rule. See src/sources/spotify.ts.
    name: 'Spotify',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'spotify'
  },
  {
    // Uber careers POST search (query=intern) across European country codes.
    // See src/sources/uber.ts.
    name: 'Uber',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'uber'
  },
  {
    // Bolt (bolt.eu) custom Next.js careers page, intern-titled roles in Europe
    // scraped from the embedded RSC payload. See src/sources/bolt.ts.
    name: 'Bolt',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'bolt'
  },
  {
    // Stripe's Greenhouse board (full descriptions inline), prefiltered to
    // intern-titled roles; the LLM judge applies the Europe rule. See src/sources/stripe.ts.
    name: 'Stripe',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'stripe'
  },
  {
    // Microsoft pcsx search (filter_seniority=Intern, newest-first), Europe by
    // country code, paged until an already-seen job. See src/sources/microsoft.ts.
    name: 'Microsoft',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'microsoft'
  },
  {
    // Google Careers embeds full job records in the search results page. Track
    // Bachelor/Master-accessible technical student roles, excluding high-school
    // apprenticeship, STEP, gReach, PhD-only, postdoc and senior/staff tracks.
    name: 'Google',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'google'
  },
  {
    // Google DeepMind's own Greenhouse board. Keep only explicit student/intern
    // or graduate technical roles; generic full-time research roles are excluded
    // before the LLM unless they are clearly student-level.
    name: 'Google DeepMind',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'deepmind',
    company: 'Google DeepMind'
  },
  {
    // Qualcomm's careers.qualcomm.com Eightfold API. Track Europe-based
    // technical internships, working-student roles, and graduate SWE/research
    // roles; descriptions come from the position_details endpoint.
    name: 'Qualcomm',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'qualcomm',
    company: 'Qualcomm'
  },
  {
    // Apple Jobs public search/detail endpoints. Search is noisy, so the source
    // scans bounded Europe location buckets plus student technical keywords and
    // filters obvious non-student/non-technical roles before the LLM.
    name: 'Apple',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'apple',
    company: 'Apple'
  },
  {
    // Databricks Greenhouse board. The live board is large and mostly full-time
    // senior/sales/solutions roles, so the source keeps only explicit
    // student-level technical titles in Europe before LLM judging.
    name: 'Databricks',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'databricks',
    company: 'Databricks'
  },
  {
    // NVIDIA Workday CXS API. Discover Workday facet IDs at runtime, restrict
    // search to Europe country facets, then keep explicit intern/new-grad/
    // working-student technical roles before LLM judging.
    name: 'NVIDIA',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'nvidia',
    company: 'NVIDIA'
  },
  {
    // Snowflake's Ashby board (full descriptions inline). The board skews senior
    // and go-to-market and posts many non-technical interns (SDR, marketing,
    // comms), so the source keeps only technical student titles in Europe.
    name: 'Snowflake',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'snowflake',
    company: 'Snowflake',
  },
  {
    // OpenAI's Ashby board (full descriptions inline). Europe is ~60 roles but
    // internships/residencies are posted rarely, so this portal is often empty —
    // that is expected, not a fetch failure.
    name: 'OpenAI',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'openai',
    company: 'OpenAI'
  },
  {
    // Palantir's Lever board (full descriptions inline, real alpha-2 country per
    // posting). Keeps intern-commitment or intern-titled technical roles in
    // Europe; Deployment Strategist is left to the LLM to judge.
    name: 'Palantir',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'palantir',
    company: 'Palantir'
  },
];

async function main(): Promise<void> {
  await connect();

  // activeHours is never $set, for the same reason as a portal's status: it is a
  // knob meant to be tuned in the DB, and re-seeding must not reset it. It is
  // filled in only where it is missing — $setOnInsert alone would leave the
  // settings doc that predates the field without a window forever.
  const { activeHours, ...settingsFields } = settingsSeed;
  await settingsCol().updateOne({}, { $set: settingsFields }, { upsert: true });
  const backfilled = await settingsCol().updateOne(
    { activeHours: { $exists: false } },
    { $set: { activeHours } },
  );
  console.log(
    `[seed] settings upserted${backfilled.modifiedCount ? `, activeHours defaulted to ${describeActiveHours(activeHours!)}` : ''}`,
  );

  for (const portal of portalsSeed) {
    // status is $setOnInsert, never $set: a new portal starts in `install` so its
    // back-catalogue is only recorded as a baseline, while re-seeding an existing
    // portal must not knock it back into install and swallow its pending jobs.
    const { status, ...fields } = portal;
    const res = await portalsCol().updateOne(
      { name: portal.name },
      { $set: fields, $setOnInsert: { status: status ?? 'install' } },
      { upsert: true },
    );
    console.log(
      `[seed] portal "${portal.name}" ${res.upsertedId ? 'inserted (status=install)' : 'updated'}`,
    );
  }

  await close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}
