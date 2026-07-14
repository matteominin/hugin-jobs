import { createHash } from 'node:crypto';
import { config } from './config.js';
import { jobs as jobsCol, portals as portalsCol, settings as settingsCol } from './db.js';
import { judge } from './llm/judge.js';
import type { Source } from './sources/index.js';
import { notify, notifyPortalDisabled } from './telegram.js';
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
  /** set once the portal is auto-disabled, so the scheduler stops its loop */
  disabled = false;

  constructor(
    private readonly portal: Portal,
    private readonly source: Source,
  ) {}

  async run(): Promise<void> {
    const { portal } = this;
    const portalId = portal._id!;
    const tag = `[${portal.name}]`;
    // dry-run neither writes nor notifies, so the baseline would only hide the
    // judging it exists to exercise: test new portals as if they were running.
    const installing = portal.status === 'install' && !config.dryRun;
    console.log(
      `${tag} run start (source=${portal.source}${installing ? ', install' : ''}${config.dryRun ? ', dry-run' : ''})`,
    );

    // Fetch + persist may fail (network, source change); judging still runs
    // afterwards so any record left unchecked by a previous stopped run — or new
    // ones from this run — is (re)judged. Judging selects jobs with no verdict.
    let extracted: RawJob[] | null = null;
    try {
      extracted = await this.source.produce();
      console.log(`${tag} produced ${extracted.length} jobs`);

      if (config.dryRun) {
        await this.logDryRunDedup(portalId, extracted);
      } else {
        const newCount = await this.persistNew(portalId, extracted, installing);
        console.log(
          installing
            ? `${tag} install: recorded ${newCount} job(s) as baseline, ${extracted.length - newCount} already seen`
            : `${tag} ${newCount} new job(s), ${extracted.length - newCount} already seen`,
        );

        await this.onFetchSuccess(portalId);
        // only once the baseline is actually stored, so a failed install retries
        if (installing) await this.finishInstall(portalId);
      }
    } catch (err) {
      console.error(
        config.dryRun
          ? `${tag} produce failed in dry-run:`
          : `${tag} produce/persist failed, judging already-stored jobs anyway:`,
        err instanceof Error ? err.message : err,
      );
      if (config.dryRun) {
        console.error(`${tag} dry-run: skipped failure counter/auto-disable update`);
      } else {
        await this.onFetchFailure(portalId, err);
      }
    }

    if (installing) {
      console.log(`${tag} install: skipped LLM judging and notifications for this cycle`);
    } else if (config.dryRun) {
      if (extracted) await this.judgeDryRun(portalId, extracted);
    } else {
      await this.judgePending(portalId);
    }

    if (config.dryRun) {
      console.log(`${tag} dry-run: skipped lastRunAt update`);
    } else {
      await portalsCol().updateOne({ _id: portalId }, { $set: { lastRunAt: new Date() } });
    }
    console.log(`${tag} run done`);
  }

  /** Clear the consecutive-failure counter after a good fetch. */
  private async onFetchSuccess(portalId: Job['portalId']): Promise<void> {
    if ((this.portal.failureCount ?? 0) === 0) return;
    this.portal.failureCount = 0;
    await portalsCol().updateOne({ _id: portalId }, { $set: { failureCount: 0 } });
  }

  /**
   * Count a consecutive fetch failure; once it reaches `config.maxFetchFailures`
   * the portal is disabled in the DB and a Telegram alert is sent, so a broken
   * source stops burning cycles until someone re-enables it.
   */
  private async onFetchFailure(portalId: Job['portalId'], err: unknown): Promise<void> {
    const tag = `[${this.portal.name}]`;
    const updated = await portalsCol().findOneAndUpdate(
      { _id: portalId },
      { $inc: { failureCount: 1 } },
      { returnDocument: 'after' },
    );
    const count = updated?.failureCount ?? (this.portal.failureCount ?? 0) + 1;
    this.portal.failureCount = count;
    console.error(`${tag} consecutive fetch failure ${count}/${config.maxFetchFailures}`);

    if (count >= config.maxFetchFailures) {
      await portalsCol().updateOne({ _id: portalId }, { $set: { enabled: false } });
      this.disabled = true;
      console.error(`${tag} auto-disabled after ${count} consecutive fetch failures`);
      await notifyPortalDisabled(this.portal.name, err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Leave `install` once the baseline is stored, so the next cycle judges and
   * notifies normally. The in-memory portal is updated too: the scheduler keeps
   * the same object across cycles.
   */
  private async finishInstall(portalId: Job['portalId']): Promise<void> {
    // catches jobs stored before the portal was put back into install
    await jobsCol().updateMany(
      { portalId, match: { $exists: false } },
      { $set: { backfilled: true } },
    );
    this.portal.status = 'running';
    await portalsCol().updateOne({ _id: portalId }, { $set: { status: 'running' } });
    console.log(`[${this.portal.name}] install complete → status=running`);
  }

  /**
   * Insert unseen jobs; the unique (portalId, hash) index guards races.
   * During an install cycle the inserts are marked `backfilled`, which keeps them
   * out of `judgePending` forever — they are the "already knew about these" set.
   */
  private async persistNew(
    portalId: Job['portalId'],
    extracted: RawJob[],
    installing = false,
  ): Promise<number> {
    let newCount = 0;
    for (const raw of extracted) {
      const hash = hashJob(portalId.toString(), raw);
      const doc: Job = { ...raw, portalId, hash, notified: false, createdAt: new Date() };
      if (installing) doc.backfilled = true;
      const res = await jobsCol().updateOne(
        { portalId, hash },
        { $setOnInsert: doc },
        { upsert: true },
      );
      if (res.upsertedId) newCount++;
    }
    return newCount;
  }

  /** Report dedup state without inserting jobs. */
  private async logDryRunDedup(portalId: Job['portalId'], extracted: RawJob[]): Promise<void> {
    const candidates = await this.dryRunCandidates(portalId, extracted);
    console.log(
      `[${this.portal.name}] dry-run: ${candidates.length} would be new, ${extracted.length - candidates.length} already seen`,
    );
  }

  /** Build job-shaped records for unseen extracted jobs, without writing them. */
  private async dryRunCandidates(
    portalId: Job['portalId'],
    extracted: RawJob[],
  ): Promise<Job[]> {
    const docs = extracted.map((raw) => {
      const hash = hashJob(portalId.toString(), raw);
      return { ...raw, portalId, hash, notified: false, createdAt: new Date() } satisfies Job;
    });
    if (docs.length === 0) return [];

    const seen = new Set(
      (
        await jobsCol()
          .find({ portalId, hash: { $in: docs.map((d) => d.hash) } })
          .project({ hash: 1 })
          .toArray()
      ).map((d) => d.hash as string),
    );

    return docs.filter((doc) => !seen.has(doc.hash));
  }

  /**
   * Judge every stored job without a verdict yet (new ones + past failures),
   * except the baseline recorded by an install cycle.
   * The LLM calls are the slow part, so we run them in concurrent batches of
   * `config.judgeConcurrency`. Failures are isolated per job (the job stays
   * pending and is retried next cycle) so one bad call can't sink the batch.
   */
  private async judgePending(portalId: Job['portalId']): Promise<void> {
    const pending = await jobsCol()
      .find({ portalId, match: { $exists: false }, backfilled: { $ne: true } })
      .toArray();
    await this.judgeJobs(pending, false);
  }

  /** Judge extracted-but-unpersisted jobs in dry-run mode. */
  private async judgeDryRun(portalId: Job['portalId'], extracted: RawJob[]): Promise<void> {
    const candidates = await this.dryRunCandidates(portalId, extracted);
    if (candidates.length === 0) return;
    if (config.dryRunSkipLlm) {
      for (const job of candidates) {
        console.log(`[${this.portal.name}] dry-run: would judge "${job.title}"`);
      }
      console.log(`[${this.portal.name}] dry-run: skipped LLM for ${candidates.length} job(s)`);
      return;
    }
    await this.judgeJobs(candidates, true);
  }

  /** Judge jobs and either persist/notify (live) or only log outcomes (dry-run). */
  private async judgeJobs(candidates: Job[], dryRun: boolean): Promise<void> {
    const settings = await this.loadSettings();
    const tag = `[${this.portal.name}]`;
    if (candidates.length === 0) return;

    let tokensIn = 0;
    let tokensOut = 0;
    let judged = 0;
    for (let i = 0; i < candidates.length; i += config.judgeConcurrency) {
      const batch = candidates.slice(i, i + config.judgeConcurrency);
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
        if (!dryRun) {
          await jobsCol().updateOne({ _id: job._id }, { $set: { match, enrichment, usage } });
        }
        tokensIn += usage.inputTokens;
        tokensOut += usage.outputTokens;
        judged++;
        console.log(
          `${tag} ${dryRun ? 'dry-run: ' : ''}judged "${job.title}" → suitable=${match.suitable} score=${match.score.toFixed(2)} tags=[${enrichment.tags.join(', ')}] tokens=${usage.inputTokens}/${usage.outputTokens}`,
        );

        if (match.suitable) {
          if (dryRun) {
            console.log(`${tag} dry-run: would notify "${job.title}"`);
          } else {
            await notify({ ...job, match, enrichment });
            await jobsCol().updateOne({ _id: job._id }, { $set: { notified: true } });
          }
        }
      }
    }

    console.log(
      `${tag} ${dryRun ? 'dry-run: ' : ''}judged ${judged}/${candidates.length} job(s), tokens in/out: ${tokensIn}/${tokensOut}`,
    );
  }

  private async loadSettings(): Promise<Settings> {
    const s = await settingsCol().findOne({});
    if (!s) throw new Error('no settings document — run `npm run seed` first');
    return s;
  }
}
