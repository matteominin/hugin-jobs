import { config } from '../config.js';
import type { Portal, RawJob } from '../types.js';

/** A realistic browser UA — several career APIs reject the default client. */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * A Source produces the list of jobs for a portal via `produce()`. The JobRunner
 * then dedups, judges and notifies on whatever it returns — a source only has to
 * fetch and shape jobs into `RawJob[]`.
 */
export interface Source {
  produce(): Promise<RawJob[]>;
}

/**
 * Base class for code sources. Handles the boilerplate every source needs — an
 * HTTP GET/POST with a browser UA and a timeout, JSON parsing, and typed access
 * to the portal's `sourceOptions` — so a new source is just a `produce()` that
 * calls `fetchJson`/`fetchText` and maps the result. Extend it and implement
 * `produce()`; register the subclass in `getSource()`.
 */
export abstract class BaseSource implements Source {
  constructor(protected readonly portal: Portal) {}

  abstract produce(): Promise<RawJob[]>;

  /** GET/POST a URL and return the body text. Throws on non-2xx or timeout. */
  protected async fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
    // AbortSignal.timeout guards against a request that never responds, which
    // would otherwise hang the portal (Node's fetch has no default timeout).
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: { 'user-agent': BROWSER_UA, ...opts.headers },
      body: opts.body,
      signal: AbortSignal.timeout(config.httpTimeoutMs),
    });
    if (!res.ok) {
      throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }

  /** Same as `fetchText`, parsed as JSON. */
  protected async fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
    return JSON.parse(await this.fetchText(url, opts)) as T;
  }

  /** Read a typed value from the portal's `sourceOptions`, or a fallback. */
  protected option<T>(key: string, fallback: T): T {
    return (this.portal.sourceOptions?.[key] as T | undefined) ?? fallback;
  }
}
