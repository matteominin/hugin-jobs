import { ObjectId } from 'mongodb';

/** How the raw content is retrieved. */
export type Transport = 'http' | 'playwright';

/** How jobs are parsed out of the raw content. */
export type Strategy = 'css' | 'json';

export interface RequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** playwright-only: wait for this CSS selector before reading the page */
  waitForSelector?: string;
}

export interface CssExtraction {
  listSelector: string;
  baseUrl?: string;
  fields: {
    title: string;
    /** selector, optionally with `@attr` suffix (default: href for links, text otherwise) */
    url: string;
    description?: string;
    company?: string;
    location?: string;
  };
}

export interface JsonExtraction {
  /** dot-path to the array of jobs, e.g. "data.jobs" ("" = root array) */
  jobsPath: string;
  fields: {
    title: string;
    url: string;
    description?: string;
    company?: string;
    location?: string;
  };
}

export type Extraction = CssExtraction | JsonExtraction;

export interface Portal {
  _id?: ObjectId;
  name: string;
  enabled: boolean;
  intervalSeconds: number;
  /**
   * Named code source (see src/sources/). When set, this portal is produced by
   * that Source class and the config fields below are ignored. When omitted, the
   * default config-driven source is used and request/transport/strategy are required.
   */
  source?: string;
  /** free-form options passed to a code Source (e.g. { seniorities: [...] }) */
  sourceOptions?: Record<string, unknown>;
  request?: RequestConfig;
  /** transport used to fetch the raw content (default: http) */
  transport?: Transport;
  strategy?: Strategy;
  extraction?: Extraction;
  /** default company for this portal; used when the LLM can't extract one */
  company?: string;
  /** extra matching criteria appended to the global prompt */
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
