import type { Portal } from '../types.js';
import { AmazonSource } from './amazon.js';
import type { Source } from './base.js';
import { BoltSource } from './bolt.js';
import { MicrosoftSource } from './microsoft.js';
import { SpotifySource } from './spotify.js';
import { StripeSource } from './stripe.js';
import { UberSource } from './uber.js';

export type { Source } from './base.js';
export { BaseSource } from './base.js';

/**
 * Registry of code sources, keyed by the portal's `source` field. To add a
 * portal for a new job poster: write a `BaseSource` subclass in this folder,
 * add it here, then insert a portal document with that key (see src/seed.ts).
 */
const registry: Record<string, (portal: Portal) => Source> = {
  amazon: (portal) => new AmazonSource(portal),
  spotify: (portal) => new SpotifySource(portal),
  uber: (portal) => new UberSource(portal),
  bolt: (portal) => new BoltSource(portal),
  stripe: (portal) => new StripeSource(portal),
  microsoft: (portal) => new MicrosoftSource(portal),
};

/** Resolve the code source for a portal by its `source` key. */
export function getSource(portal: Portal): Source {
  const factory = registry[portal.source];
  if (!factory) {
    throw new Error(`unknown source "${portal.source}" for portal "${portal.name}"`);
  }
  return factory(portal);
}
