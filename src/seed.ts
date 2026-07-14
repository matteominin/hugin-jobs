import { pathToFileURL } from 'node:url';
import { close, connect, portals as portalsCol, settings as settingsCol } from './db.js';
import type { Portal, Settings } from './types.js';

export const settingsSeed: Settings = {
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
    source: 'amazon',
  },
  {
    // lifeatspotify.com engineering category, intern-titled roles. List-only (no
    // descriptions); the LLM judge applies the Europe rule. See src/sources/spotify.ts.
    name: 'Spotify',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'spotify',
  },
  {
    // Uber careers POST search (query=intern) across European country codes.
    // See src/sources/uber.ts.
    name: 'Uber',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'uber',
  },
  {
    // Bolt (bolt.eu) custom Next.js careers page, intern-titled roles in Europe
    // scraped from the embedded RSC payload. See src/sources/bolt.ts.
    name: 'Bolt',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'bolt',
  },
  {
    // Stripe's Greenhouse board (full descriptions inline), prefiltered to
    // intern-titled roles; the LLM judge applies the Europe rule. See src/sources/stripe.ts.
    name: 'Stripe',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'stripe',
  },
  {
    // Microsoft pcsx search (filter_seniority=Intern, newest-first), Europe by
    // country code, paged until an already-seen job. See src/sources/microsoft.ts.
    name: 'Microsoft',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'microsoft',
  },
  {
    // Google Careers embeds full job records in the search results page. Track
    // Bachelor/Master-accessible technical student roles, excluding high-school
    // apprenticeship, STEP, gReach, PhD-only, postdoc and senior/staff tracks.
    name: 'Google (EU student technical roles)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'google',
    promptOverride:
      'For Google, accept Bachelor/Master-accessible graduate, intern, SWE intern, ' +
      'research intern, research engineering intern, and Student Researcher BS/MS roles. ' +
      'Reject apprenticeships, STEP, postdoc, PhD-only, gReach/restricted-program, senior, ' +
      'staff, manager/director, and non-technical roles.',
  },
  {
    // Google DeepMind's own Greenhouse board. Keep only explicit student/intern
    // or graduate technical roles; generic full-time research roles are excluded
    // before the LLM unless they are clearly student-level.
    name: 'Google DeepMind (EU student technical roles)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'deepmind',
    company: 'Google DeepMind',
    promptOverride:
      'For Google DeepMind, accept only explicitly DeepMind-branded Bachelor/Master-accessible ' +
      'graduate, intern, SWE intern, research intern, research engineering intern, or student ' +
      'research roles. Reject generic Google Student Researcher roles unless the title explicitly ' +
      'says DeepMind. Reject apprenticeships, STEP, postdoc, PhD-only, senior/staff, manager/director, ' +
      'and non-technical roles.',
  },
  {
    // Qualcomm's careers.qualcomm.com Eightfold API. Track Europe-based
    // technical internships, working-student roles, and graduate SWE/research
    // roles; descriptions come from the position_details endpoint.
    name: 'Qualcomm (EU student technical roles)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'qualcomm',
    company: 'Qualcomm',
    promptOverride:
      'For Qualcomm, treat this portal-specific role-level rule as the applicable criterion: ' +
      'accept Bachelor/Master-accessible graduate, intern, working-student, SWE intern, research ' +
      'intern, research engineering intern, AI/ML intern, and technical engineering student roles ' +
      'in Europe. Reject PhD-only roles, postdoc, senior/staff/lead, manager/director, sales, ' +
      'marketing, business development, operations, HR, legal, and other non-technical roles.',
  },
  {
    // Apple Jobs public search/detail endpoints. Search is noisy, so the source
    // scans bounded Europe location buckets plus student technical keywords and
    // filters obvious non-student/non-technical roles before the LLM.
    name: 'Apple (EU student technical roles)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'apple',
    company: 'Apple',
    promptOverride:
      'For Apple, treat this portal-specific role-level rule as the applicable criterion: ' +
      'accept Bachelor/Master-accessible graduate, intern, working-student, SWE intern, ' +
      'research intern, AI/ML intern, and technical engineering student roles in Europe. ' +
      'Reject PhD-only internships, postdoc, senior/staff/lead, manager/director, Apple Retail, ' +
      'specialist/expert/store roles, sales, marketing, business, operations, HR, legal, finance, ' +
      'and other non-technical roles.',
  },
  {
    // Databricks Greenhouse board. The live board is large and mostly full-time
    // senior/sales/solutions roles, so the source keeps only explicit
    // student-level technical titles in Europe before LLM judging.
    name: 'Databricks (EU student technical roles)',
    enabled: true,
    intervalSeconds: 60 * 20,
    source: 'databricks',
    company: 'Databricks',
    promptOverride:
      'For Databricks, accept only explicit Bachelor/Master-accessible intern, internship, ' +
      'working-student, new-grad, graduate, SWE intern, research intern, AI/ML intern, or ' +
      'technical engineering student roles in Europe. Reject PhD-only internships, postdoc, ' +
      'senior/staff/principal/lead, manager/director, full-time ordinary software roles unless ' +
      'clearly new-grad/early-career, solutions architect, pre-sales/presales, field engineering, ' +
      'sales, marketing, business development, operations, recruiting, legal, finance, and other ' +
      'non-target roles.',
  },
];

async function main(): Promise<void> {
  await connect();

  await settingsCol().updateOne({}, { $set: settingsSeed }, { upsert: true });
  console.log('[seed] settings upserted');

  for (const portal of portalsSeed) {
    await portalsCol().updateOne({ name: portal.name }, { $set: portal }, { upsert: true });
    console.log(`[seed] portal "${portal.name}" upserted`);
  }

  await close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}
