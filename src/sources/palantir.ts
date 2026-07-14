import type { RawJob } from '../types.js';
import { isEuropeAlpha2 } from '../util/europe.js';
import { htmlToText } from '../util/html.js';
import { BaseSource } from './base.js';

const DEFAULT_BOARD = 'palantir';
const boardUrl = (board: string): string => `https://api.lever.co/v0/postings/${board}?mode=json`;

const TARGET_TITLE =
  /\b(intern|internship|working student|werkstudent|new grad(uate)?|graduate|student|campus|path to palantir)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?|forward deployed|fde|deployment strategist|product)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account executive|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations)\b/i;

interface LeverList {
  text?: string;
  content?: string;
}

interface LeverPosting {
  text: string;
  hostedUrl: string;
  /** ISO-3166 alpha-2 of the posting's office, e.g. "GB". */
  country?: string;
  categories?: {
    commitment?: string;
    location?: string;
    team?: string;
    allLocations?: string[];
  };
  descriptionPlain?: string;
  description?: string;
  lists?: LeverList[];
  additional?: string;
}

/**
 * Palantir hosts its jobs on Lever, which returns the whole board with
 * descriptions inline — one request per cycle. Lever gives a real alpha-2
 * `country` per posting, so Europe is an exact filter rather than a location
 * regex. Note `categories.commitment` is unreliable on its own (several
 * "…, Internship" roles are tagged `Full-time`), so a match on either the
 * commitment or the title counts.
 */
export class PalantirSource extends BaseSource {
  async produce(): Promise<RawJob[]> {
    const board = this.option<string>('board', DEFAULT_BOARD);
    const postings = await this.fetchJson<LeverPosting[]>(boardUrl(board));

    return postings
      .filter((posting) => this.keep(posting))
      .map(
        (posting) =>
          ({
            title: posting.text,
            url: posting.hostedUrl,
            location: posting.categories?.allLocations?.join(' / ') ?? posting.categories?.location,
            description: htmlToText(this.descriptionText(posting)),
            company: 'Palantir',
          }) satisfies RawJob,
      );
  }

  private keep(posting: LeverPosting): boolean {
    const commitment = posting.categories?.commitment ?? '';
    const isStudentRole = /intern(ship)?/i.test(commitment) || TARGET_TITLE.test(posting.text);

    if (!isStudentRole) return false;
    if (!TECHNICAL_SIGNAL.test(`${posting.text} ${posting.categories?.team ?? ''}`)) return false;
    if (EXCLUDED_TITLE.test(posting.text)) return false;
    return this.inEurope(posting);
  }

  /** Postings with no country at all are kept and left to the LLM to judge. */
  private inEurope(posting: LeverPosting): boolean {
    if (!posting.country) return true;
    return isEuropeAlpha2(posting.country);
  }

  private descriptionText(posting: LeverPosting): string {
    const lists = (posting.lists ?? [])
      .map((list) => [list.text, list.content].filter(Boolean).join('\n'))
      .filter(Boolean);
    return [posting.description, ...lists, posting.additional].filter(Boolean).join('\n\n');
  }
}
