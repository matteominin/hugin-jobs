import { HttpFetcher } from '../fetchers/http.js';
import type { Portal, RawJob } from '../types.js';
import { htmlToText } from '../util/html.js';
import type { Source } from './index.js';

const DXP_URL = 'https://dxp-api.celonis.com/v1/jobs';
const GREENHOUSE_URL = 'https://boards-api.greenhouse.io/v1/boards/celonis/jobs?content=true';
const DEFAULT_SENIORITIES = ['Working Student & Intern'];

interface DxpJob {
  jobId: number;
  title: string;
  groupedLocation?: string;
  seniority?: string;
}
interface GreenhouseJob {
  id: number;
  absolute_url: string;
  content: string;
}

/**
 * Celonis exposes two APIs: the DXP list carries a `seniority` field (great for
 * prefiltering to interns) but no description; the Greenhouse board carries full
 * descriptions. We fetch both once and join them by id — so the whole portal is
 * exactly two requests, no per-job detail fetches. Prefiltering by seniority also
 * cuts the number of jobs handed to the LLM by ~90%.
 */
export class CelonisSource implements Source {
  private readonly http = new HttpFetcher();

  constructor(private readonly portal: Portal) {}

  async produce(): Promise<RawJob[]> {
    const seniorities =
      (this.portal.sourceOptions?.seniorities as string[] | undefined) ?? DEFAULT_SENIORITIES;

    const [dxp, gh] = await Promise.all([
      this.getJson<{ jobs: DxpJob[] }>(DXP_URL),
      this.getJson<{ jobs: GreenhouseJob[] }>(GREENHOUSE_URL),
    ]);

    const byId = new Map(gh.jobs.map((j) => [String(j.id), j]));

    return dxp.jobs
      .filter((j) => j.seniority != null && seniorities.includes(j.seniority))
      .map((j) => {
        const match = byId.get(String(j.jobId));
        return {
          title: j.title,
          url: match?.absolute_url ?? `https://job-boards.greenhouse.io/celonis/jobs/${j.jobId}`,
          location: j.groupedLocation,
          description: htmlToText(match?.content),
          company: 'Celonis',
        } satisfies RawJob;
      });
  }

  private async getJson<T>(url: string): Promise<T> {
    return JSON.parse(await this.http.fetch({ url, method: 'GET' })) as T;
  }
}
