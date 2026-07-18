import type { Portal } from '../types.js';
import { AdobeSource } from './adobe.js';
import { AirbnbSource } from './airbnb.js';
import { AmazonSource } from './amazon.js';
import { AppleSource } from './apple.js';
import { AsmlSource } from './asml.js';
import { AtlassianSource } from './atlassian.js';
import type { Source } from './base.js';
import { BoltSource } from './bolt.js';
import { CelonisSource } from './celonis.js';
import { CloudflareSource } from './cloudflare.js';
import { CoinbaseSource } from './coinbase.js';
import { CohereSource } from './cohere.js';
import { ConfluentSource } from './confluent.js';
import { DatabricksSource } from './databricks.js';
import { DatadogSource } from './datadog.js';
import { DeepMindSource } from './deepmind.js';
import { DeliverooSource } from './deliveroo.js';
import { DiscordSource } from './discord.js';
import { DropboxSource } from './dropbox.js';
import { AdyenSource } from './adyen.js';
import { ElasticSource } from './elastic.js';
import { FigmaSource } from './figma.js';
import { FlowTradersSource } from './flowtraders.js';
import { GitHubSource } from './github.js';
import { GitLabSource } from './gitlab.js';
import { GoogleSource } from './google.js';
import { GraphcoreSource } from './graphcore.js';
import { JetBrainsSource } from './jetbrains.js';
import { LinearSource } from './linear.js';
import { MicrosoftSource } from './microsoft.js';
import { MiroSource } from './miro.js';
import { MongoDbSource } from './mongodb.js';
import { NetflixSource } from './netflix.js';
import { NotionSource } from './notion.js';
import { NvidiaSource } from './nvidia.js';
import { OpenAiSource } from './openai.js';
import { PalantirSource } from './palantir.js';
import { PerplexitySource } from './perplexity.js';
import { PinterestSource } from './pinterest.js';
import { QualcommSource } from './qualcomm.js';
import { SkyscannerSource } from './skyscanner.js';
import { TwilioSource } from './twilio.js';
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
  coinbase: (portal) => new CoinbaseSource(portal),
  datadog: (portal) => new DatadogSource(portal),
  mongodb: (portal) => new MongoDbSource(portal),
  figma: (portal) => new FigmaSource(portal),
  gitlab: (portal) => new GitLabSource(portal),
  pinterest: (portal) => new PinterestSource(portal),
  skyscanner: (portal) => new SkyscannerSource(portal),
  cohere: (portal) => new CohereSource(portal),
  perplexity: (portal) => new PerplexitySource(portal),
  deliveroo: (portal) => new DeliverooSource(portal),
  adyen: (portal) => new AdyenSource(portal),
  flowtraders: (portal) => new FlowTradersSource(portal),
  jetbrains: (portal) => new JetBrainsSource(portal),
  elastic: (portal) => new ElasticSource(portal),
  graphcore: (portal) => new GraphcoreSource(portal),
  twilio: (portal) => new TwilioSource(portal),
  celonis: (portal) => new CelonisSource(portal),
  miro: (portal) => new MiroSource(portal),
  linear: (portal) => new LinearSource(portal),
  confluent: (portal) => new ConfluentSource(portal),
  netflix: (portal) => new NetflixSource(portal),
  asml: (portal) => new AsmlSource(portal),
  adobe: (portal) => new AdobeSource(portal),
  airbnb: (portal) => new AirbnbSource(portal),
  discord: (portal) => new DiscordSource(portal),
  notion: (portal) => new NotionSource(portal),
  dropbox: (portal) => new DropboxSource(portal),
  github: (portal) => new GitHubSource(portal),
  atlassian: (portal) => new AtlassianSource(portal),
};

/** Resolve the code source for a portal by its `source` key. */
export function getSource(portal: Portal): Source {
  const factory = registry[portal.source];
  if (!factory) {
    throw new Error(`unknown source "${portal.source}" for portal "${portal.name}"`);
  }
  return factory(portal);
}
