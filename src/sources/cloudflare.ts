import { isEuropeLocationText } from '../util/europe.js';
import { GreenhouseSource, type GreenhouseJob } from './greenhouse.js';

const TARGET_TITLE = /\b(intern(ship)?|working student|new grad(uate)?|graduate)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|research|ai|machine learning|data|security|network|systems?|infrastructure|platform|backend|frontend|full[- ]?stack)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|staff|principal|lead|manager|director|sales|marketing|brand|social media|policy|compliance|legal|finance|people team|hr|human resources|recruit(?:er|ing)|professional services|customer)\b/i;

/**
 * Cloudflare's Greenhouse board. Its `location.name` is a work mode
 * ("In-Office" / "Distributed"), not a place — the real city/country lives in
 * `offices`, so both the Europe check and the RawJob location read from there.
 */
export class CloudflareSource extends GreenhouseSource {
  protected readonly defaultBoard = 'cloudflare';
  protected readonly companyName = 'Cloudflare';

  protected keep(job: GreenhouseJob): boolean {
    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(job.title)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    return isEuropeLocationText(this.locationText(job));
  }

  protected locationText(job: GreenhouseJob): string | undefined {
    const offices = (job.offices ?? []).map((office) => office.name).filter(Boolean).join('; ');
    return offices || job.location?.name;
  }
}
