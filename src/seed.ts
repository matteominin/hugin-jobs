import { close, connect, portals as portalsCol, settings as settingsCol } from './db.js';
import type { Portal, Settings } from './types.js';

const settings: Settings = {
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

// Celonis (Munich-based) is served by the `celonis` code source: it prefilters
// the DXP list by seniority (interns only) and joins Greenhouse for the full
// descriptions — two fetches, no per-job detail calls. See src/sources/celonis.ts.
const portalsSeed: Portal[] = [
  {
    name: 'Celonis (interns)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'celonis',
    sourceOptions: { seniorities: ['Working Student & Intern'] },
  },
  {
    // amazon.jobs public search API: base_query=intern + European country codes.
    // Full descriptions inline, single paged request. See src/sources/amazon.ts.
    name: 'Amazon (EU interns)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'amazon',
  },
  {
    // Oracle Recruiting Cloud REST search (keyword=intern), paged and prefiltered
    // to Europe by country code. See src/sources/oracle.ts.
    name: 'Oracle (EU interns)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'oracle',
  },
  {
    // lifeatspotify.com engineering category, intern-titled roles. List-only (no
    // descriptions); the LLM judge applies the Europe rule. See src/sources/spotify.ts.
    name: 'Spotify (engineering interns)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'spotify',
  },
  {
    // Uber careers POST search (query=intern) across European country codes.
    // See src/sources/uber.ts.
    name: 'Uber (EU interns)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'uber',
  },
  {
    // Bolt (bolt.eu) custom Next.js careers page, intern-titled roles in Europe
    // scraped from the embedded RSC payload. See src/sources/bolt.ts.
    name: 'Bolt (EU interns)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'bolt',
  },
  {
    // Stripe's Greenhouse board (full descriptions inline), prefiltered to
    // intern-titled roles; the LLM judge applies the Europe rule. See src/sources/stripe.ts.
    name: 'Stripe (interns)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'stripe',
  },
];

async function main(): Promise<void> {
  await connect();

  await settingsCol().updateOne({}, { $set: settings }, { upsert: true });
  console.log('[seed] settings upserted');

  for (const portal of portalsSeed) {
    await portalsCol().updateOne({ name: portal.name }, { $set: portal }, { upsert: true });
    console.log(`[seed] portal "${portal.name}" upserted`);
  }

  await close();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
