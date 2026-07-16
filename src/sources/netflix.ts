import type { RawJob } from '../types.js';
import { isEuropeLocationText } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const API_BASE = 'https://explore.jobs.netflix.net';
const DOMAIN = 'netflix.com';
/**
 * Eightfold token-matches, so "intern" subsumes "internship" and every
 * "software/research intern" phrasing. "graduate" / "working student" were
 * measured to return only description-matched noise (no student-titled roles
 * beyond what "intern" finds), so one query is the whole sweep.
 */
const DEFAULT_QUERIES = ['intern'];
const DEFAULT_MAX_PER_QUERY = 100;

const TARGET_TITLE = /\b(intern(ship)?|working student|new grad(uate)?)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|research|ai|machine learning|ml\b|data|algorithm|systems?|infrastructure|platform|security|video|streaming)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|staff|principal|lead|manager|director|sales|marketing|publicity|communications|legal|finance|hr|human resources|recruit(?:er|ing))\b/i;

interface NetflixPosition {
  id: number | string;
  name: string;
  location?: string;
  locations?: string[];
  job_description?: string;
  canonicalPositionUrl?: string;
}

interface NetflixSearchResponse {
  positions?: NetflixPosition[];
  count?: number;
}

/**
 * Netflix's explore.jobs.netflix.net is an Eightfold "apply" site (the pcsx
 * API is disabled there). The v2 search lists positions without descriptions;
 * the per-id detail endpoint fills them in for kept jobs only. Netflix intern
 * roles are almost all US, so 0 jobs is the normal steady state here.
 */
export class NetflixSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const queries = this.option<string[]>('queries', DEFAULT_QUERIES);
    const maxPerQuery = this.option<number>('maxPerQuery', DEFAULT_MAX_PER_QUERY);
    const kept = new Map<string, NetflixPosition>();

    for (const query of queries) {
      for (const position of await this.searchAll(query, maxPerQuery)) {
        if (this.keep(position)) kept.set(String(position.id), position);
      }
    }

    const rawJobs: RawJob[] = [];
    for (const position of kept.values()) {
      const detail = await this.detail(position.id).catch(() => position);
      const merged = { ...position, ...detail };
      rawJobs.push({
        title: merged.name,
        url: merged.canonicalPositionUrl ?? `${API_BASE}/careers/job/${merged.id}`,
        location: (merged.locations ?? [merged.location]).filter(Boolean).join(' / ') || undefined,
        description: htmlToText(merged.job_description ?? ''),
        company: 'Netflix',
      });
    }

    return rawJobs;
  }

  private keep(position: NetflixPosition): boolean {
    if (!TARGET_TITLE.test(position.name)) return false;
    if (!TECHNICAL_SIGNAL.test(position.name)) return false;
    if (EXCLUDED_TITLE.test(position.name)) return false;
    const locations = position.locations ?? [position.location].filter(Boolean);
    if (locations.length === 0) return true;
    return locations.some((location) => isEuropeLocationText(location));
  }

  private async searchAll(query: string, maxPerQuery: number): Promise<NetflixPosition[]> {
    const results: NetflixPosition[] = [];
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

  private async search(query: string, start: number): Promise<NetflixSearchResponse> {
    const params = new URLSearchParams({ domain: DOMAIN, query, start: String(start), num: '10' });
    return this.fetchJson<NetflixSearchResponse>(`${API_BASE}/api/apply/v2/jobs?${params}`, {
      headers: { accept: 'application/json' },
    });
  }

  private async detail(id: number | string): Promise<NetflixPosition> {
    return this.fetchJson<NetflixPosition>(`${API_BASE}/api/apply/v2/jobs/${id}?domain=${DOMAIN}`, {
      headers: { accept: 'application/json' },
    });
  }
}
