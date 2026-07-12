import { extract } from '../extractors/index.js';
import { getFetcher } from '../fetchers/index.js';
import type { Portal, RawJob } from '../types.js';
import type { Source } from './index.js';

/**
 * Default config-driven source: fetch the portal URL with the configured
 * transport, then extract jobs with the configured strategy. No code needed —
 * everything comes from the portal's Mongo record.
 */
export class ConfigSource implements Source {
  constructor(private readonly portal: Portal) {}

  async produce(): Promise<RawJob[]> {
    const p = this.portal;
    if (!p.request || !p.transport || !p.strategy) {
      throw new Error(
        `portal "${p.name}" has no code source and is missing request/transport/strategy`,
      );
    }
    const body = await getFetcher(p.transport).fetch(p.request);
    return extract(p, body);
  }
}
