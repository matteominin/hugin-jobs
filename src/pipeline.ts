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

  const settings = await loadSettings();
  let newCount = 0;

  for (const raw of extracted) {
    const hash = hashJob(portalId.toString(), raw);

    // Insert only if unseen; unique index on (portalId, hash) guards races.
    const doc: Job = {
      ...raw,
      portalId,
      hash,
      notified: false,
      createdAt: new Date(),
    };
    const insert = await jobsCol().updateOne(
      { portalId, hash },
      { $setOnInsert: doc },
      { upsert: true },
    );
    if (!insert.upsertedId) continue; // already seen
    newCount++;

    const verdict = await judge(raw, settings, portal.promptOverride);
    await jobsCol().updateOne({ portalId, hash }, { $set: { match: verdict } });
    console.log(
      `${tag} judged "${raw.title}" → suitable=${verdict.suitable} score=${verdict.score.toFixed(2)}`,
    );

    if (verdict.suitable) {
      await notify({ ...doc, match: verdict });
      await jobsCol().updateOne({ portalId, hash }, { $set: { notified: true } });
    }
  }

  await portalsCol().updateOne({ _id: portalId }, { $set: { lastRunAt: new Date() } });
  console.log(`${tag} run done — ${newCount} new job(s)`);
}
