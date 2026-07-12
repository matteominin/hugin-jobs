import { ObjectId } from 'mongodb';

/**
 * A portal is a job poster to watch. Fetching is done entirely by a code source
 * (see src/sources/); the document only names the source and holds the per-portal
 * knobs: how often to run, an optional prompt override, and options for the source.
 */
export interface Portal {
  _id?: ObjectId;
  name: string;
  enabled: boolean;
  /** how often to re-fetch this portal, in seconds */
  intervalSeconds: number;
  /** key of the code source that produces this portal's jobs (see getSource) */
  source: string;
  /** free-form options passed to the code source (e.g. { seniorities: [...] }) */
  sourceOptions?: Record<string, unknown>;
  /** default company for this portal; used when the LLM can't extract one */
  company?: string;
  /** extra matching criteria appended to the global prompt, specific to this poster */
  promptOverride?: string;
  lastRunAt?: Date;
  /** consecutive fetch failures; the portal is auto-disabled once it hits the cap */
  failureCount?: number;
}

/** A job as extracted from a portal, before persistence. */
export interface RawJob {
  title: string;
  url: string;
  description?: string;
  company?: string;
  location?: string;
}

export interface MatchVerdict {
  suitable: boolean;
  score: number;
  reasoning: string;
  model: string;
}

/** LLM token usage for the judge call, stored per job for observability. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

/** Metadata the LLM extracts from a job listing (null when not stated). */
export interface Enrichment {
  /** role tags, e.g. ["full stack", "software engineer"] */
  tags: string[];
  location: string | null;
  company: string | null;
  seniority: string | null;
  workMode: WorkMode;
  techStack: string[];
  salary: string | null;
}

export interface Job extends RawJob {
  _id?: ObjectId;
  portalId: ObjectId;
  hash: string;
  match?: MatchVerdict;
  enrichment?: Enrichment;
  /** token usage of the judge call that produced `match` */
  usage?: TokenUsage;
  notified: boolean;
  createdAt: Date;
}

export interface Settings {
  _id?: ObjectId;
  globalPrompt: string;
  positionDescription: string;
}
