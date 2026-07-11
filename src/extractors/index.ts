import type { CssExtraction, JsonExtraction, Portal, RawJob } from '../types.js';
import { extractCss } from './css.js';
import { extractJson } from './json.js';
import { extractLlm } from './llm.js';

/** Dispatch extraction based on the portal's configured strategy. */
export async function extract(portal: Portal, body: string): Promise<RawJob[]> {
  switch (portal.strategy) {
    case 'css':
      return extractCss(body, portal.extraction as CssExtraction);
    case 'json':
      return extractJson(body, portal.extraction as JsonExtraction);
    case 'llm':
      return extractLlm(body);
    default:
      throw new Error(`unknown strategy: ${(portal as Portal).strategy}`);
  }
}
