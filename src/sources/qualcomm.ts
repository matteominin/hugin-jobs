import type { RawJob } from '../types.js';
import { isEuropeAlpha2 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const API_BASE = 'https://careers.qualcomm.com';
const DOMAIN = 'qualcomm.com';
const SEARCH_URL = `${API_BASE}/api/pcsx/search`;
const DETAILS_URL = `${API_BASE}/api/pcsx/position_details`;
/**
 * Eightfold matches on tokens, so a narrower phrase never adds anything its
 * head term didn't already find: "intern" subsumes "software/engineering/
 * research intern" and "internship", and "graduate" subsumes "new graduate".
 * These three are what's left once the subsumed phrasings are removed — they
 * return the same postings for a third of the requests.
 */
const DEFAULT_QUERIES = ['intern', 'graduate', 'working student'];
const DEFAULT_MAX_PER_QUERY = 120;

const TARGET_LEVEL =
  /\b(intern(ship)?|working student|work[- ]?study|graduate|new grad|college graduate)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineering|engineer|research|ai|machine learning|deep learning|algorithm|computer vision|cpu|gpu|cloud|data center|verification|digital design|simulation|firmware|systems?|virtual platform|model(?:ing|ling)|dependability|product definition|r&d)\b/i;
const EXCLUDED_TITLE =
  /\b(phd internship|post-?doctoral|postdoc|senior|staff|principal|lead|manager|director|sales|business development|marketing|communications|operations|finance|legal|account(?:ing|ant)|people|hr|human resources|recruit(?:er|ing)|venture|customer success|program manager|product manager|designer|design)\b/i;

interface QualcommPosition {
  id: number | string;
  displayJobId?: string;
  name: string;
  locations?: string[];
  standardizedLocations?: string[];
  department?: string;
  positionUrl?: string;
  publicUrl?: string;
  jobDescription?: string;
}

interface QualcommResponse<T> {
  data?: T;
}

interface SearchData {
  positions?: QualcommPosition[];
  count?: number;
}

/**
 * Qualcomm's current careers site is an Eightfold PCS page. The public JSON
 * search API returns lightweight positions, then position_details provides the
 * full HTML job description for LLM judging.
 */
export class QualcommSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const queries = this.option<string[]>('queries', DEFAULT_QUERIES);
    const maxPerQuery = this.option<number>('maxPerQuery', DEFAULT_MAX_PER_QUERY);
    const jobs = new Map<string, QualcommPosition>();

    for (const query of queries) {
      const positions = await this.searchAll(query, maxPerQuery);
      for (const position of positions) {
        if (this.keep(position)) jobs.set(String(position.id), position);
      }
    }

    const rawJobs: RawJob[] = [];
    for (const position of jobs.values()) {
      const detail = await this.details(position.id).catch(() => position);
      const merged = { ...position, ...detail };
      rawJobs.push({
        title: merged.name,
        url: this.urlOf(merged),
        location: (merged.locations ?? []).join(' / ') || undefined,
        description: htmlToText(
          [merged.department, merged.jobDescription, merged.displayJobId].filter(Boolean).join('\n\n'),
        ),
        company: 'Qualcomm',
      });
    }

    return rawJobs;
  }

  private keep(position: QualcommPosition): boolean {
    const text = `${position.name}\n${position.department ?? ''}`;
    if (!TARGET_LEVEL.test(text)) return false;
    if (!TECHNICAL_SIGNAL.test(text)) return false;
    if (EXCLUDED_TITLE.test(text)) return false;
    return this.inEurope(position);
  }

  private inEurope(position: QualcommPosition): boolean {
    const standardized = position.standardizedLocations ?? [];
    if (standardized.length === 0) return true;
    return standardized.some((location) => isEuropeAlpha2(countryCodeOf(location)));
  }

  private urlOf(position: QualcommPosition): string {
    if (position.publicUrl) return position.publicUrl;
    return `${API_BASE}${position.positionUrl ?? `/careers/job/${position.id}`}`;
  }

  private async searchAll(query: string, maxPerQuery: number): Promise<QualcommPosition[]> {
    const results: QualcommPosition[] = [];
    let start = 0;

    while (start < maxPerQuery) {
      const data = await this.search(query, start);
      const positions = data.positions ?? [];
      if (positions.length === 0) break;

      results.push(...positions);
      start += positions.length;
      if (start >= (data.count ?? 0)) break;
    }

    return results;
  }

  private async search(query: string, start: number): Promise<SearchData> {
    const params = new URLSearchParams();
    params.set('domain', DOMAIN);
    params.set('query', query);
    params.set('start', String(start));

    const response = await this.fetchJson<QualcommResponse<SearchData>>(
      `${SEARCH_URL}?${params.toString()}`,
      { headers: { accept: 'application/json' } },
    );
    return response.data ?? {};
  }

  private async details(id: number | string): Promise<QualcommPosition> {
    const params = new URLSearchParams();
    params.set('domain', DOMAIN);
    params.set('position_id', String(id));

    const response = await this.fetchJson<QualcommResponse<QualcommPosition>>(
      `${DETAILS_URL}?${params.toString()}`,
      { headers: { accept: 'application/json' } },
    );
    return response.data ?? ({ id, name: String(id) } satisfies QualcommPosition);
  }
}

function countryCodeOf(standardizedLocation: string): string | undefined {
  const parts = standardizedLocation.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.at(-1);
}
