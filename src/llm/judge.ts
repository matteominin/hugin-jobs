import { generateObject } from 'ai';
import { z } from 'zod';
import type { MatchVerdict, RawJob, Settings } from '../types.js';
import { assertLlmConfigured, model, modelId } from './model.js';

const verdictSchema = z.object({
  suitable: z.boolean().describe('true if this job is a good fit for the described position'),
  score: z.number().min(0).max(1).describe('confidence of the fit, 0..1'),
  reasoning: z.string().describe('one or two sentences explaining the verdict'),
});

/** Ask the LLM whether a single job fits the described position. */
export async function judge(
  job: RawJob,
  settings: Settings,
  promptOverride?: string,
): Promise<MatchVerdict> {
  assertLlmConfigured();

  const criteria = [settings.positionDescription, promptOverride].filter(Boolean).join('\n\n');
  const jobText = [
    `Title: ${job.title}`,
    job.company && `Company: ${job.company}`,
    job.location && `Location: ${job.location}`,
    job.description && `Description: ${job.description}`,
    `URL: ${job.url}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { object } = await generateObject({
    model,
    schema: verdictSchema,
    system: settings.globalPrompt,
    prompt: `Position I'm looking for:\n${criteria}\n\nJob listing:\n${jobText}`,
  });

  return { ...object, model: modelId };
}
