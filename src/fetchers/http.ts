import type { RequestConfig } from '../types.js';
import type { Fetcher } from './index.js';

/** Fetches raw content with the built-in HTTP client. */
export class HttpFetcher implements Fetcher {
  async fetch(req: RequestConfig): Promise<string> {
    const res = await fetch(req.url, {
      method: req.method ?? 'GET',
      headers: {
        'user-agent': 'hugin-jobs/0.1 (+https://github.com/matteominin/hugin-jobs)',
        ...req.headers,
      },
      body: req.body,
    });
    if (!res.ok) {
      throw new Error(`fetch ${req.url} failed: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
}
