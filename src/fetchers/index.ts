import type { RequestConfig, Transport } from '../types.js';
import { HttpFetcher } from './http.js';
import { PlaywrightFetcher } from './playwright.js';

/** Strategy interface for retrieving a portal's raw content. */
export interface Fetcher {
  fetch(req: RequestConfig): Promise<string>;
}

/** Resolve the fetcher for a portal's configured transport. */
export function getFetcher(transport: Transport): Fetcher {
  switch (transport) {
    case 'http':
      return new HttpFetcher();
    case 'playwright':
      return new PlaywrightFetcher();
    default:
      throw new Error(`unknown transport: ${transport as string}`);
  }
}
