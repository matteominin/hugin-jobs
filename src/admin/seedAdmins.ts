import bcrypt from 'bcryptjs';
import { close, connect, adminUsers } from '../db.js';

/**
 * Seed exactly the two admin accounts. Credentials come from the environment so
 * plaintext never lands in code or git:
 *
 *   ADMIN1_USER, ADMIN1_PASS, ADMIN2_USER, ADMIN2_PASS
 *
 * Each password is stored only as a bcrypt hash. Re-running updates the two
 * accounts' hashes and removes any other admin rows, keeping the set at two.
 */
interface Cred {
  username: string;
  password: string;
}

function readCreds(): Cred[] {
  const creds: Cred[] = [];
  for (const n of [1, 2]) {
    const username = process.env[`ADMIN${n}_USER`]?.trim();
    const password = process.env[`ADMIN${n}_PASS`];
    if (username && password) creds.push({ username, password });
  }
  return creds;
}

async function main(): Promise<void> {
  const creds = readCreds();
  if (creds.length !== 2) {
    console.error(
      'Set ADMIN1_USER/ADMIN1_PASS and ADMIN2_USER/ADMIN2_PASS in the environment (two accounts required).',
    );
    process.exit(1);
  }
  if (creds[0].username === creds[1].username) {
    console.error('The two admin usernames must differ.');
    process.exit(1);
  }

  await connect();
  const col = adminUsers();
  await col.createIndex({ username: 1 }, { unique: true });

  const usernames = creds.map((c) => c.username);
  for (const { username, password } of creds) {
    const passwordHash = await bcrypt.hash(password, 12);
    await col.updateOne(
      { username },
      {
        $set: { passwordHash },
        $setOnInsert: { username, createdAt: new Date() },
      },
      { upsert: true },
    );
    console.log(`[seed-admins] upserted admin "${username}"`);
  }

  const removed = await col.deleteMany({ username: { $nin: usernames } });
  if (removed.deletedCount) {
    console.log(`[seed-admins] removed ${removed.deletedCount} other admin account(s)`);
  }

  console.log('[seed-admins] done — two admin accounts active');
  await close();
}

main().catch((err) => {
  console.error('[seed-admins] fatal:', err);
  process.exit(1);
});
