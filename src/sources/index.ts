import type { Portal } from '../types.js';
import { AdobeSource } from './adobe.js';
import { AirbnbSource } from './airbnb.js';
import { AmazonSource } from './amazon.js';
import { AppleSource } from './apple.js';
import { AsmlSource } from './asml.js';
import type { Source } from './base.js';
import { BoltSource } from './bolt.js';
import { CloudflareSource } from './cloudflare.js';
import { DatabricksSource } from './databricks.js';
import { DeepMindSource } from './deepmind.js';
import { DiscordSource } from './discord.js';
import { GoogleSource } from './google.js';
import { MicrosoftSource } from './microsoft.js';
import { NetflixSource } from './netflix.js';
import { NvidiaSource } from './nvidia.js';
import { OpenAiSource } from './openai.js';
import { PalantirSource } from './palantir.js';
import { QualcommSource } from './qualcomm.js';
import { SnowflakeSource } from './snowflake.js';
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
  cloudflare: (portal) => new CloudflareSource(portal),
  microsoft: (portal) => new MicrosoftSource(portal),
  google: (portal) => new GoogleSource(portal),
  deepmind: (portal) => new DeepMindSource(portal),
  qualcomm: (portal) => new QualcommSource(portal),
  apple: (portal) => new AppleSource(portal),
  databricks: (portal) => new DatabricksSource(portal),
  nvidia: (portal) => new NvidiaSource(portal),
  snowflake: (portal) => new SnowflakeSource(portal),
  openai: (portal) => new OpenAiSource(portal),
  palantir: (portal) => new PalantirSource(portal),
  netflix: (portal) => new NetflixSource(portal),
  asml: (portal) => new AsmlSource(portal),
  adobe: (portal) => new AdobeSource(portal),
  airbnb: (portal) => new AirbnbSource(portal),
  discord: (portal) => new DiscordSource(portal),
};

/** Resolve the code source for a portal by its `source` key. */
export function getSource(portal: Portal): Source {
  const factory = registry[portal.source];
  if (!factory) {
    throw new Error(`unknown source "${portal.source}" for portal "${portal.name}"`);
  }
  return factory(portal);
}
