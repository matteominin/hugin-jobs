import { AshbySource, type AshbyJob } from './ashby.js';

/**
 * Student-level titles. Notion spells these out ("Software Engineer Intern
 * (Fall 2026)", "Software Engineer, New Grad"), so the title is a reliable gate.
 */
const TARGET_TITLE =
  /\b(intern|internship|working student|werkstudent|praktikum|praktikant|new grad(uate)?|university graduate|campus)\b/i;
/** European postings on this board skew go-to-market, so require a technical signal. */
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data (science|platform|engineering)|backend|frontend|fullstack|full stack|platform|infrastructure|distributed systems?|database|security|compiler|query)\b/i;
/** Notion posts non-technical early-career roles too (BDR, GRC intern). */
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|manager|director|head of|sales|sdr|bdr|account executive|solution(s)? engineer|solutions architect|forward deployed|pre-?sales|presales|business development|marketing|communications|compliance|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|gtm|go-to-market|partner|customer success|support)\b/i;
/** Same idea against the department/team fields, which name the org directly. */
const EXCLUDED_ORG =
  /\b(sales|marketing|communications|finance|legal|recruiting|people|operations|business development|customer success|support)\b/i;

/**
 * Notion publishes its jobs on an Ashby board (~140 roles, descriptions
 * inline), so the whole portal is a single request. Intern/new-grad roles are
 * currently all US-based and the European postings are almost entirely
 * go-to-market (AEs, CSMs, partner managers out of Dublin), so keep only
 * technical student-level titles in Europe — today that is legitimately 0 jobs,
 * and the filter is here for when Notion opens a European intern class.
 */
export class NotionSource extends AshbySource {
  protected readonly defaultBoard = 'notion';
  protected readonly companyName = 'Notion';

  protected keep(job: AshbyJob): boolean {
    const org = [job.department, job.team].filter(Boolean).join(' ');

    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(`${job.title} ${org}`)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (EXCLUDED_ORG.test(org)) return false;
    return this.inEurope(job);
  }
}
