import { createHash } from 'node:crypto';
import { config } from './config.js';
import { jobs as jobsCol, portals as portalsCol, settings as settingsCol } from './db.js';
import { judge } from './llm/judge.js';
import type { Source } from './sources/index.js';
import { notify } from './telegram.js';
import type { Job, Portal, RawJob, Settings } from './types.js';

function hashJob(portalId: string, job: RawJob): string {
  return createHash('sha1').update(`${portalId}|${job.url || job.title}`).digest('hex');
}

/**
 * Runs one portal end-to-end: produce jobs → dedup → judge → notify.
 * The Source (how the job list is produced) is injected, so the runner stays
 * agnostic to config-driven vs bespoke code sources.
 */
export class JobRunner {
  constructor(
    private readonly portal: Portal,
    private readonly source: Source,
  ) {}

  async run(): Promise<void> {
    const { portal } = this;
    const portalId = portal._id!;
    const tag = `[${portal.name}]`;
    console.log(`${tag} run start (source=${portal.source ?? `config:${portal.strategy}`})`);

    // Fetch + persist may fail (network, source change); judging still runs
    // afterwards so any record left unchecked by a previous stopped run — or new
    // ones from this run — is (re)judged. Judging selects jobs with no verdict.
    try {
      const extracted = await this.source.produce();
      console.log(`${tag} produced ${extracted.length} jobs`);

      const newCount = await this.persistNew(portalId, extracted);
      console.log(`${tag} ${newCount} new job(s), ${extracted.length - newCount} already seen`);
    } catch (err) {
      console.error(
        `${tag} produce/persist failed, judging already-stored jobs anyway:`,
        err instanceof Error ? err.message : err,
      );
    }

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

  /**
   * Judge every stored job without a verdict yet (new ones + past failures).
   * The LLM calls are the slow part, so we run them in concurrent batches of
   * `config.judgeConcurrency`. Failures are isolated per job (the job stays
   * pending and is retried next cycle) so one bad call can't sink the batch.
   */
  private async judgePending(portalId: Job['portalId']): Promise<void> {
    const settings = await this.loadSettings();
    const tag = `[${this.portal.name}]`;
    const pending = await jobsCol().find({ portalId, match: { $exists: false } }).toArray();
    if (pending.length === 0) return;

    let tokensIn = 0;
    let tokensOut = 0;
    let judged = 0;
    for (let i = 0; i < pending.length; i += config.judgeConcurrency) {
      const batch = pending.slice(i, i + config.judgeConcurrency);
      const settled = await Promise.allSettled(
        batch.map((job) => judge(job, settings, this.portal)),
      );

      // persist + notify sequentially to keep DB writes and Telegram order tidy
      for (let k = 0; k < batch.length; k++) {
        const job = batch[k];
        const result = settled[k];
        if (result.status === 'rejected') {
          console.error(`${tag} judge failed for "${job.title}" (will retry): ${result.reason}`);
          continue;
        }

        const { match, enrichment, usage } = result.value;
        await jobsCol().updateOne({ _id: job._id }, { $set: { match, enrichment, usage } });
        tokensIn += usage.inputTokens;
        tokensOut += usage.outputTokens;
        judged++;
        console.log(
          `${tag} judged "${job.title}" → suitable=${match.suitable} score=${match.score.toFixed(2)} tags=[${enrichment.tags.join(', ')}] tokens=${usage.inputTokens}/${usage.outputTokens}`,
        );

        if (match.suitable) {
          await notify({ ...job, match, enrichment });
          await jobsCol().updateOne({ _id: job._id }, { $set: { notified: true } });
        }
      }
    }

    console.log(
      `${tag} judged ${judged}/${pending.length} job(s), tokens in/out: ${tokensIn}/${tokensOut}`,
    );
  }

  private async loadSettings(): Promise<Settings> {
    const s = await settingsCol().findOne({});
    if (!s) throw new Error('no settings document — run `npm run seed` first');
    return s;
  }
}
