import { generateObject } from 'ai';
import { z } from 'zod';
import type { Enrichment, MatchVerdict, Portal, RawJob, Settings } from '../types.js';
import { assertLlmConfigured, model, modelId } from './model.js';

const resultSchema = z.object({
  suitable: z.boolean().describe('true if this job is a good fit for the described position'),
  score: z.number().min(0).max(1).describe('confidence of the fit, 0..1'),
  reasoning: z.string().describe('one or two sentences explaining the verdict'),
  tags: z
    .array(z.string())
    .describe('role tags, lowercase, e.g. ["full stack", "software engineer", "research engineer"]'),
  location: z
    .string()
    .nullable()
    .describe('work location extracted from the listing, or null if not stated'),
  company: z
    .string()
    .nullable()
    .describe('hiring company extracted from the listing, or null if not stated'),
  seniority: z
    .string()
    .nullable()
    .describe('seniority level, e.g. junior/mid/senior/lead, or null if not stated'),
  workMode: z
    .enum(['remote', 'hybrid', 'onsite', 'unknown'])
    .describe('work arrangement; "unknown" if not stated'),
  techStack: z
    .array(z.string())
    .describe('languages/frameworks/tools required, e.g. ["typescript", "react"]; empty if none'),
  salary: z.string().nullable().describe('salary or range if stated, else null'),
});

export interface JudgeResult {
  match: MatchVerdict;
  enrichment: Enrichment;
}

/** Judge a single job against the described position and extract its metadata. */
export async function judge(
  job: RawJob,
  settings: Settings,
  portal: Pick<Portal, 'company' | 'promptOverride'>,
): Promise<JudgeResult> {
  assertLlmConfigured();

  const criteria = [settings.positionDescription, portal.promptOverride]
    .filter(Boolean)
    .join('\n\n');

  // Location may be embedded in the description, so we don't split it out — we
  // hand the LLM whatever we have and let it extract location/company/etc.
  const jobText = [
    `Title: ${job.title}`,
    job.company && `Company (hint): ${job.company}`,
    job.location && `Location (hint): ${job.location}`,
    job.description && `Description: ${job.description}`,
    `URL: ${job.url}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { object } = await generateObject({
    model,
    schema: resultSchema,
    system: settings.globalPrompt,
    prompt: `Position I'm looking for:\n${criteria}\n\nJob listing:\n${jobText}`,
  });

  return {
    match: {
      suitable: object.suitable,
      score: object.score,
      reasoning: object.reasoning,
      model: modelId,
    },
    enrichment: {
      tags: object.tags,
      location: object.location,
      // extraction wins; fall back to the portal's configured company
      company: object.company ?? portal.company ?? null,
      seniority: object.seniority,
      workMode: object.workMode,
      techStack: object.techStack,
      salary: object.salary,
    },
  };
}
