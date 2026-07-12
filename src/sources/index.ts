import type { Portal, RawJob } from '../types.js';
import { AmazonSource } from './amazon.js';
import { BoltSource } from './bolt.js';
import { CelonisSource } from './celonis.js';
import { ConfigSource } from './config.js';
import { OracleSource } from './oracle.js';
import { SpotifySource } from './spotify.js';
import { UberSource } from './uber.js';

/**
 * A Source produces the list of jobs for a portal, however it likes — a single
 * fetch + parse (ConfigSource), or a bespoke multi-step flow (a code Source).
 * The JobRunner then dedups, judges and notifies on whatever it returns.
 */
export interface Source {
  produce(): Promise<RawJob[]>;
}

/** Named code sources for portals that config can't express. */
const registry: Record<string, (portal: Portal) => Source> = {
  celonis: (portal) => new CelonisSource(portal),
  amazon: (portal) => new AmazonSource(portal),
  oracle: (portal) => new OracleSource(portal),
  spotify: (portal) => new SpotifySource(portal),
  uber: (portal) => new UberSource(portal),
  bolt: (portal) => new BoltSource(portal),
};

/** Resolve the Source for a portal: a named code source, else the config source. */
export function getSource(portal: Portal): Source {
  if (portal.source) {
    const factory = registry[portal.source];
    if (!factory) throw new Error(`unknown source: ${portal.source}`);
    return factory(portal);
  }
  return new ConfigSource(portal);
}
