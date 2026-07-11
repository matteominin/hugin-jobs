import { close, connect, portals as portalsCol, settings as settingsCol } from './db.js';
import type { Portal, Settings } from './types.js';

const settings: Settings = {
  globalPrompt:
    'You are a job-matching assistant. Given a candidate position description and a job listing, ' +
    'decide whether the listing is a genuine fit. Be strict: only mark suitable when the role, ' +
    'seniority and domain clearly align.',
  positionDescription:
    'Backend / full-stack software engineer role working with TypeScript or Node.js. ' +
    'Remote-friendly, mid to senior level. Not interested in sales, marketing, or non-engineering roles.',
};

const samplePortal: Portal = {
  name: 'Hacker News Jobs',
  enabled: true,
  intervalSeconds: 300,
  request: { url: 'https://news.ycombinator.com/jobs', method: 'GET' },
  strategy: 'css',
  extraction: {
    listSelector: '.athing',
    baseUrl: 'https://news.ycombinator.com/',
    fields: {
      title: '.titleline a',
      url: '.titleline a@href',
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
