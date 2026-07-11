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

export interface Job extends RawJob {
  _id?: ObjectId;
  portalId: ObjectId;
  hash: string;
  match?: MatchVerdict;
  notified: boolean;
  createdAt: Date;
}

export interface Settings {
  _id?: ObjectId;
  globalPrompt: string;
  positionDescription: string;
}
