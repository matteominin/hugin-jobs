import { generateObject } from 'ai';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { assertLlmConfigured, model } from '../llm/model.js';
import type { RawJob } from '../types.js';

const jobsSchema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        description: z.string().optional(),
        company: z.string().optional(),
        location: z.string().optional(),
      }),
    )
    .describe('Every distinct job listing found on the page'),
});

/** Strip HTML down to visible text to keep the token count sane. */
function toText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20000);
}

export async function extractLlm(html: string): Promise<RawJob[]> {
  assertLlmConfigured();
  const text = toText(html);
  const { object } = await generateObject({
    model,
    schema: jobsSchema,
    prompt:
      'Extract every individual job listing from the page content below. ' +
      'Return absolute URLs when possible. Only include real job postings.\n\n' +
      text,
  });
  return object.jobs;
}
