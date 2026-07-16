import type { RawJob } from '../types.js';
import { isEuropeCountryName } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

/**
 * ASML's find-your-job page is backed by Sitecore Search ("Discover"). The
 * endpoint, widget id and API key below are the public client-side values
 * embedded in the site's JS bundles (the key is not a secret credential).
 */
const SEARCH_URL = 'https://discover-euc1.sitecorecloud.io/discover/v2/126200477';
const API_KEY = '01-967712c8-5a349c1760436ea6dccfd7bb02bfbe4dc2ccc36c';
const WIDGET_ID = 'asml_job_search';
const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_PAGES = 5;

/**
 * The board labels every posting with job_type Fix|Internship, so the sweep is
 * one server-side filtered request — no free-text queries. The exclusion list
 * only cuts the obviously non-technical internships (HR, communications,
 * finance, …) and apprenticeships; engineering/physics research internships go
 * to the LLM, which owns the software-vs-other-engineering judgement.
 */
const EXCLUDED_TITLE =
  /\b(hr|human resources?|communications?|communication science|business administration|business economics|finance|financial|legal|law|accountancy|marketing|sales|supply chain|procurement|apprenticeship|ausbildung|bbl|educational sciences|learning sciences|learning & development|global mobility|talent)\b/i;

interface AsmlJob {
  id?: string;
  job_id?: string;
  name: string;
  url: string;
  description?: string;
  job_country?: string;
  job_location?: string;
  job_type?: string;
}

interface AsmlWidgetResult {
  total_item?: number;
  content?: AsmlJob[];
  errors?: { message?: string }[];
}

interface AsmlSearchResponse {
  widgets?: AsmlWidgetResult[];
}

export class AsmlSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const limit = this.option<number>('limit', DEFAULT_LIMIT);
    const maxPages = this.option<number>('maxPages', DEFAULT_MAX_PAGES);

    const jobs = new Map<string, AsmlJob>();
    for (let page = 0; page < maxPages; page++) {
      const result = await this.search(limit, page * limit);
      const content = result.content ?? [];
      for (const job of content) jobs.set(job.job_id ?? job.id ?? job.url, job);
      if (content.length === 0 || page * limit + content.length >= (result.total_item ?? 0)) break;
    }

    return Array.from(jobs.values())
      .filter((job) => this.keep(job))
      .map(
        (job) =>
          ({
            title: job.name,
            url: job.url,
            location: job.job_location ?? job.job_country,
            description: htmlToText(job.description ?? ''),
            company: 'ASML',
          }) satisfies RawJob,
      );
  }

  private keep(job: AsmlJob): boolean {
    if (EXCLUDED_TITLE.test(job.name)) return false;
    // Unknown country falls through to the LLM rather than being dropped.
    return !job.job_country || isEuropeCountryName(job.job_country);
  }

  private async search(limit: number, offset: number): Promise<AsmlWidgetResult> {
    const body = {
      context: {
        page: { uri: '/en/careers/find-your-job' },
        locale: { country: 'us', language: 'en' },
      },
      widget: {
        items: [
          {
            entity: 'content',
            rfk_id: this.option<string>('widgetId', WIDGET_ID),
            search: {
              content: {},
              limit,
              offset,
              filter: { type: 'eq', name: 'job_type', value: 'Internship' },
            },
          },
        ],
      },
    };

    const response = await this.fetchJson<AsmlSearchResponse>(SEARCH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: this.option<string>('apiKey', API_KEY),
      },
      body: JSON.stringify(body),
    });

    const widget = response.widgets?.[0] ?? {};
    // A successful response still carries a benign "page not found for uri"
    // warning in `errors`, so only a widget with no content at all is fatal.
    if (!widget.content && widget.errors?.length) {
      throw new Error(`ASML search failed: ${widget.errors[0]?.message ?? 'unknown error'}`);
    }
    return widget;
  }
}
