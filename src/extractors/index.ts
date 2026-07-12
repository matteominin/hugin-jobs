import type { CssExtraction, JsonExtraction, Portal, RawJob } from '../types.js';
import { extractCss } from './css.js';
import { extractJson } from './json.js';

/** Dispatch extraction based on the portal's configured strategy. */
export function extract(portal: Portal, body: string): RawJob[] {
  switch (portal.strategy) {
    case 'css':
      return extractCss(body, portal.extraction as CssExtraction);
    case 'json':
      return extractJson(body, portal.extraction as JsonExtraction);
    default:
      throw new Error(`unknown strategy: ${String(portal.strategy)}`);
  }
}
