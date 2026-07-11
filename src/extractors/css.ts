import * as cheerio from 'cheerio';
import type { CssExtraction, RawJob } from '../types.js';

/**
 * Resolve one field from an element. Selector may carry an `@attr` suffix
 * (e.g. "a@href"); otherwise text content is used. An empty selector reads the
 * job element itself.
 */
function pick($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>, spec?: string): string | undefined {
  if (!spec) return undefined;
  const [selector, attr] = spec.split('@');
  const target = selector ? el.find(selector).first() : el;
  if (target.length === 0) return undefined;
  const value = attr ? target.attr(attr) : target.text().trim();
  return value?.trim() || undefined;
}

export function extractCss(html: string, extraction: CssExtraction): RawJob[] {
  const $ = cheerio.load(html);
  const jobs: RawJob[] = [];

  $(extraction.listSelector).each((_, node) => {
    const el = $(node);
    const title = pick($, el, extraction.fields.title);
    let url = pick($, el, extraction.fields.url);
    if (!title || !url) return;

    if (extraction.baseUrl) {
      try {
        url = new URL(url, extraction.baseUrl).toString();
      } catch {
        /* keep raw url if it can't be resolved */
      }
    }

    jobs.push({
      title,
      url,
      description: pick($, el, extraction.fields.description),
      company: pick($, el, extraction.fields.company),
      location: pick($, el, extraction.fields.location),
    });
  });

  return jobs;
}
