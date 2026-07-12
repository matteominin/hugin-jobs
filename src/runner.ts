import { createHash } from 'node:crypto';
import { jobs as jobsCol, portals as portalsCol, settings as settingsCol } from './db.js';
import { extract } from './extractors/index.js';
import type { Fetcher } from './fetchers/index.js';
import { judge } from './llm/judge.js';
import { notify } from './telegram.js';
import type { Job, Portal, RawJob, Settings } from './types.js';

function hashJob(portalId: string, job: RawJob): string {
  return createHash('sha1').update(`${portalId}|${job.url || job.title}`).digest('hex');
}

/**
 * Runs one portal end-to-end: fetch → extract → dedup → judge → notify.
 * The transport is injected as a Fetcher, so the runner stays agnostic to how
 * the raw content is retrieved (HTTP, headless browser, …).
 */
export class JobRunner {
  constructor(
    private readonly portal: Portal,
    private readonly fetcher: Fetcher,
  ) {}

  async run(): Promise<void> {
    const { portal } = this;
    const portalId = portal._id!;
    const tag = `[${portal.name}]`;
    console.log(`${tag} run start (transport=${portal.transport}, strategy=${portal.strategy})`);

    const body = await this.fetcher.fetch(portal.request);
    const extracted = extract(portal, body);
    console.log(`${tag} extracted ${extracted.length} jobs`);

    const newCount = await this.persistNew(portalId, extracted);
    console.log(`${tag} ${newCount} new job(s), ${extracted.length - newCount} already seen`);

    await this.judgePending(portalId);

    await portalsCol().updateOne({ _id: portalId }, { $set: { lastRunAt: new Date() } });
    console.log(`${tag} run done`);
  }

  /** Insert unseen jobs; the unique (portalId, hash) index guards races. */
  private async persistNew(portalId: Job['portalId'], extracted: RawJob[]): Promise<number> {
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
    return newCount;
  }

  /** Judge every stored job without a verdict yet (new ones + past failures). */
  private async judgePending(portalId: Job['portalId']): Promise<void> {
    const settings = await this.loadSettings();
    const tag = `[${this.portal.name}]`;
    const pending = await jobsCol().find({ portalId, match: { $exists: false } }).toArray();

    for (const job of pending) {
      const { match, enrichment } = await judge(job, settings, this.portal);
      await jobsCol().updateOne({ _id: job._id }, { $set: { match, enrichment } });
      console.log(
        `${tag} judged "${job.title}" → suitable=${match.suitable} score=${match.score.toFixed(2)} tags=[${enrichment.tags.join(', ')}]`,
      );

      if (match.suitable) {
        await notify({ ...job, match, enrichment });
        await jobsCol().updateOne({ _id: job._id }, { $set: { notified: true } });
      }
    }
  }

  private async loadSettings(): Promise<Settings> {
    const s = await settingsCol().findOne({});
    if (!s) throw new Error('no settings document — run `npm run seed` first');
    return s;
  }
}
