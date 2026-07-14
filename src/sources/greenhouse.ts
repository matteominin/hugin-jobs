import type { RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const boardUrl = (board: string): string =>
  `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;

export interface GreenhouseMetadata {
  name?: string;
  value?: string | string[];
}

export interface GreenhouseJob {
  title: string;
  absolute_url: string;
  content?: string;
  company_name?: string;
  location?: { name?: string };
  metadata?: GreenhouseMetadata[];
}

/**
 * Shared base for posters on a Greenhouse board (`stripe`, `databricks`,
 * `deepmind`). `?content=true` returns the whole board with descriptions
 * inline, so a portal is one request; Greenhouse can't filter server-side and
 * the boards are large and mostly senior, so subclasses prefilter in `keep()`.
 */
export abstract class GreenhouseSource extends BaseSource {
  /** Greenhouse board slug, overridable per portal via `sourceOptions.board`. */
  protected abstract readonly defaultBoard: string;
  /** Fallback company when the board doesn't carry one. */
  protected abstract readonly companyName: string;

  /** Cheap prefilter: true to send this job to the LLM judge. */
  protected abstract keep(job: GreenhouseJob): boolean;

  async produce(): Promise<RawJob[]> {
    const board = this.option<string>('board', this.defaultBoard);
    const { jobs = [] } = await this.fetchJson<{ jobs?: GreenhouseJob[] }>(boardUrl(board));

    return jobs
      .filter((job) => this.keep(job))
      .map(
        (job) =>
          ({
            title: job.title,
            url: job.absolute_url,
            location: job.location?.name,
            description: htmlToText(this.descriptionText(job)),
            company: job.company_name ?? this.companyName,
          }) satisfies RawJob,
      );
  }

  /** The listing body plus any board metadata fields. */
  protected descriptionText(job: GreenhouseJob): string {
    return [job.content, this.metadataText(job)].filter(Boolean).join('\n\n');
  }

  /**
   * Greenhouse `metadata` is a free-form per-board list (e.g. Databricks puts
   * the job category there), flattened to "name: value" lines.
   */
  protected metadataText(job: GreenhouseJob): string {
    return (job.metadata ?? [])
      .map((item) => {
        const value = Array.isArray(item.value) ? item.value.join(', ') : item.value;
        return [item.name, value].filter(Boolean).join(': ');
      })
      .filter(Boolean)
      .join('\n');
  }
}
