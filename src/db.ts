import { Collection, Db, MongoClient } from 'mongodb';
import { config } from './config.js';
import type { AdminUser, Job, Portal, Settings } from './types.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connect(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(config.mongoUri);
  await client.connect();
  db = client.db(config.mongoDb);
  // dedup guard: one job per (portal, hash)
  await db.collection('jobs').createIndex({ portalId: 1, hash: 1 }, { unique: true });
  console.log(`[db] connected to ${config.mongoUri}/${config.mongoDb}`);
  return db;
}

export async function close(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

function getDb(): Db {
  if (!db) throw new Error('db not connected — call connect() first');
  return db;
}

export const portals = (): Collection<Portal> => getDb().collection<Portal>('portals');
export const jobs = (): Collection<Job> => getDb().collection<Job>('jobs');
export const settings = (): Collection<Settings> => getDb().collection<Settings>('settings');
export const adminUsers = (): Collection<AdminUser> => getDb().collection<AdminUser>('adminUsers');
