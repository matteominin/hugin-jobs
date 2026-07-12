import { config } from '../config.js';
import type { RequestConfig } from '../types.js';
import type { Fetcher } from './index.js';

/** Fetches raw content with the built-in HTTP client. */
export class HttpFetcher implements Fetcher {
  async fetch(req: RequestConfig): Promise<string> {
    // AbortSignal.timeout guards against a request that never responds, which
    // would otherwise hang the portal (Node's fetch has no default timeout).
    const res = await fetch(req.url, {
      method: req.method ?? 'GET',
      headers: {
        'user-agent': 'hugin-jobs/0.1',
        ...req.headers,
      },
      body: req.body,
      signal: AbortSignal.timeout(config.httpTimeoutMs),
    });
    if (!res.ok) {
      throw new Error(`fetch ${req.url} failed: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
}
