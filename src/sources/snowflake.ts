import { AshbySource, type AshbyJob } from './ashby.js';

/**
 * Student-level titles. Snowflake spells its target roles out ("Software
 * Engineer Intern - Berlin (2026)"), so the title alone is a reliable gate.
 */
const TARGET_TITLE =
  /\b(intern|internship|working student|werkstudent|praktikum|praktikant|new grad(uate)?|university graduate|campus)\b/i;
/** The board is mostly go-to-market, so require a technical signal. */
const TECHNICAL_SIGNAL =
  /\b(software|engineer(ing)?|developer|research|ai|ml|machine learning|data (science|platform|engineering)|backend|frontend|fullstack|full stack|platform|infrastructure|distributed systems?|database|security|compiler|query)\b/i;
/** Snowflake posts many non-technical interns (SDR, marketing, comms). */
const EXCLUDED_TITLE =
  /\b(phd|post-?doctoral|postdoc|senior|sr\.?|staff|principal|lead|manager|director|sales|sdr|account executive|solution(s)? engineer|solutions architect|pre-?sales|presales|business development|marketing|communications|legal|finance|recruit(er|ing|ment)|people|hr\b|operations|gtm|go-to-market|partner|customer success|support)\b/i;
/** Same idea against the department/team fields, which name the org directly. */
const EXCLUDED_ORG =
  /\b(sales|marketing|communications|finance|legal|recruiting|people|operations|business development|customer success|support)\b/i;

/**
 * Snowflake publishes its jobs on an Ashby board (~400 roles, descriptions
 * inline), so the whole portal is a single request. The board skews senior and
 * go-to-market, so keep only technical student-level titles in Europe — that
 * cuts ~99% of the board before the LLM.
 */
export class SnowflakeSource extends AshbySource {
  protected readonly defaultBoard = 'snowflake';
  protected readonly companyName = 'Snowflake';

  protected keep(job: AshbyJob): boolean {
    const org = [job.department, job.team].filter(Boolean).join(' ');

    if (!TARGET_TITLE.test(job.title)) return false;
    if (!TECHNICAL_SIGNAL.test(`${job.title} ${org}`)) return false;
    if (EXCLUDED_TITLE.test(job.title)) return false;
    if (EXCLUDED_ORG.test(org)) return false;
    return this.inEurope(job);
  }
}
