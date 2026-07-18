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
    name: 'Amazon',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'amazon'
  },
  {
    name: 'Spotify',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'spotify'
  },
  {
    name: 'Uber',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'uber'
  },
  {
    name: 'Bolt',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'bolt'
  },
  {
    name: 'Stripe',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'stripe'
  },
  {
    name: 'Microsoft',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'microsoft'
  },
  {
    name: 'Google',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'google'
  },
  {
    name: 'Google DeepMind',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'deepmind',
    company: 'Google DeepMind'
  },
  {
    name: 'Qualcomm',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'qualcomm',
    company: 'Qualcomm'
  },
  {
    name: 'Apple',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'apple',
    company: 'Apple'
  },
  {
    name: 'Databricks',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'databricks',
    company: 'Databricks'
  },
  {
    name: 'NVIDIA',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'nvidia',
    company: 'NVIDIA'
  },
  {
    name: 'Snowflake',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'snowflake',
    company: 'Snowflake',
  },
  {
    name: 'OpenAI',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'openai',
    company: 'OpenAI'
  },
  {
    name: 'Cloudflare',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'cloudflare',
    company: 'Cloudflare'
  },
  {
    name: 'Netflix',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'netflix',
    company: 'Netflix'
  },
  {
    name: 'ASML',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'asml',
    company: 'ASML'
  },
  {
    name: 'Adobe',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'adobe',
    company: 'Adobe'
  },
  {
    name: 'Airbnb',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'airbnb',
    company: 'Airbnb'
  },
  {
    name: 'Discord',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'discord',
    company: 'Discord'
  },
  {
    name: 'Notion',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'notion',
    company: 'Notion'
  },
  {
    name: 'Dropbox',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'dropbox',
    company: 'Dropbox'
  },
  {
    name: 'GitHub',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'github',
    company: 'GitHub'
  },
  {
    name: 'Atlassian',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'atlassian',
    company: 'Atlassian'
  },
  {
    name: 'Palantir',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'palantir',
    company: 'Palantir'
  },
  {
    name: 'Coinbase',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'coinbase',
    company: 'Coinbase'
  },
  {
    name: 'Datadog',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'datadog',
    company: 'Datadog'
  },
  {
    name: 'MongoDB',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'mongodb',
    company: 'MongoDB'
  },
  {
    name: 'Figma',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'figma',
    company: 'Figma'
  },
  {
    name: 'GitLab',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'gitlab',
    company: 'GitLab'
  },
  {
    name: 'Skyscanner',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'skyscanner',
    company: 'Skyscanner'
  },
  {
    name: 'Pinterest',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'pinterest',
    company: 'Pinterest'
  },
  {
    name: 'Cohere',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'cohere',
    company: 'Cohere'
  },
  {
    name: 'Perplexity',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'perplexity',
    company: 'Perplexity'
  },
  {
    name: 'Deliveroo',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'deliveroo',
    company: 'Deliveroo'
  },
];

async function main(): Promise<void> {
  await connect();
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
