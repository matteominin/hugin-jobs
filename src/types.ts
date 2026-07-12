import { ObjectId } from 'mongodb';

export type Strategy = 'css' | 'json' | 'llm';

export interface RequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
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

export type Extraction = CssExtraction | JsonExtraction | Record<string, never>;

export interface Portal {
  _id?: ObjectId;
  name: string;
  enabled: boolean;
  intervalSeconds: number;
  request: RequestConfig;
  strategy: Strategy;
  extraction: Extraction;
  /** default company for this portal; used when the LLM can't extract one */
  company?: string;
  /** extra matching criteria appended to the global prompt */
  promptOverride?: string;
  lastRunAt?: Date;
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
  notified: boolean;
  createdAt: Date;
}

export interface Settings {
  _id?: ObjectId;
  globalPrompt: string;
  positionDescription: string;
}
