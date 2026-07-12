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

// Celonis (Munich-based) publishes on Greenhouse, whose JSON API returns full
// description + location — so the Europe/internship/education filters can work.
// Also exercises the `json` strategy end-to-end.
const samplePortal: Portal = {
  name: 'Celonis (Greenhouse)',
  enabled: true,
  intervalSeconds: 3600,
  request: {
    url: 'https://boards-api.greenhouse.io/v1/boards/celonis/jobs?content=true',
    method: 'GET',
  },
  transport: 'http',
  strategy: 'json',
  extraction: {
    jobsPath: 'jobs',
    fields: {
      title: 'title',
      url: 'absolute_url',
      description: 'content',
      company: 'company_name',
      location: 'location.name',
    },
  },
};

async function main(): Promise<void> {
  await connect();

  await settingsCol().updateOne({}, { $set: settings }, { upsert: true });
  console.log('[seed] settings upserted');

  await portalsCol().updateOne(
    { name: samplePortal.name },
    { $set: samplePortal },
    { upsert: true },
  );
  console.log(`[seed] portal "${samplePortal.name}" upserted`);

  await close();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
