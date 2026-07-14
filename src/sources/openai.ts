import { AshbySource, type AshbyJob } from './ashby.js';

/**
 * Student-level titles. `\bintern\b` must stay bounded — the board carries
 * "Software Engineer, Internal Applications" and "Internal Communications",
 * which an unbounded `intern` would match. "Residency" is OpenAI's own
 * early-career track and is worth catching alongside internships.
 */
const TARGET_TITLE =
  /\b(intern|internship|residency|resident|working student|werkstudent|new grad(uate)?|university graduate|student|apprentice(ship)?)\b/i;
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research(er)?|scientist|ai|ml|machine learning|data|backend|frontend|fullstack|full stack|platform|infrastructure|security|systems?)\b/i;
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|head of|manager|director|sales|account (director|executive)|solutions engineer|business development|marketing|communications|policy|legal|finance|tax|recruit(er|ing|ment)|people|hr\b|operations)\b/i;
const EXCLUDED_ORG =
  /\b(sales|marketing|communications|finance|legal|policy|recruiting|people|operations|business development|customer success)\b/i;

/**
 * OpenAI publishes its jobs on an Ashby board (~700 roles, descriptions
 * inline) — one request for the portal. Europe is ~60 roles but the board
 * carries no internship or residency openings much of the time, so this portal
 * legitimately produces zero jobs until one is posted.
 */
export class OpenAiSource extends AshbySource {
  protected readonly defaultBoard = 'openai';
  protected readonly companyName = 'OpenAI';

  protected keep(job: AshbyJob): boolean {
    const org = [job.department, job.team].filter(Boolean).join(' ');

    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(`${job.title} ${org}`)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (EXCLUDED_ORG.test(org)) return false;
    return this.inEurope(job);
  }
}
