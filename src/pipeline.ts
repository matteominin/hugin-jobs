import { createHash } from 'node:crypto';
import { jobs as jobsCol, portals as portalsCol, settings as settingsCol } from './db.js';
import { extract } from './extractors/index.js';
import { fetchPortal } from './fetcher.js';
import { judge } from './llm/judge.js';
import { notify } from './telegram.js';
import type { Job, Portal, RawJob, Settings } from './types.js';

function hashJob(portalId: string, job: RawJob): string {
  return createHash('sha1').update(`${portalId}|${job.url || job.title}`).digest('hex');
}

async function loadSettings(): Promise<Settings> {
  const s = await settingsCol().findOne({});
  if (!s) throw new Error('no settings document — run `npm run seed` first');
  return s;
}

/** Run one full cycle for a portal: fetch → extract → dedup → judge → notify. */
export async function runPortal(portal: Portal): Promise<void> {
  const portalId = portal._id!;
  const tag = `[${portal.name}]`;
  console.log(`${tag} run start (strategy=${portal.strategy})`);

  const body = await fetchPortal(portal.request);
  const extracted = await extract(portal, body);
  console.log(`${tag} extracted ${extracted.length} jobs`);

  // Persist unseen jobs. Unique index on (portalId, hash) guards races.
  let newCount = 0;
  for (const raw of extracted) {
    const hash = hashJob(portalId.toString(), raw);
    const doc: Job = { ...raw, portalId, hash, notified: false, createdAt: new Date() };
    const res = await jobsCol().updateOne(
      { portalId, hash },
      { $setOnInsert: doc },
      { upsert: true },
    );
    if (res.upsertedId) newCount++;
  }
  console.log(`${tag} ${newCount} new job(s), ${extracted.length - newCount} already seen`);

  // Judge every stored job without a verdict yet (new ones + past failures).
  const settings = await loadSettings();
  const pending = await jobsCol().find({ portalId, match: { $exists: false } }).toArray();
  for (const job of pending) {
    const verdict = await judge(job, settings, portal.promptOverride);
    await jobsCol().updateOne({ _id: job._id }, { $set: { match: verdict } });
    console.log(
      `${tag} judged "${job.title}" → suitable=${verdict.suitable} score=${verdict.score.toFixed(2)}`,
    );

    if (verdict.suitable) {
      await notify({ ...job, match: verdict });
      await jobsCol().updateOne({ _id: job._id }, { $set: { notified: true } });
    }
  }

  await portalsCol().updateOne({ _id: portalId }, { $set: { lastRunAt: new Date() } });
  console.log(`${tag} run done`);
}
