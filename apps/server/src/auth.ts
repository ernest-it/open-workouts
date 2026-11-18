import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { DB } from './db';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(key, expected);
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface User {
  id: string;
  username: string;
  isAdmin: number;
  createdAt: number;
}

/** Creates an opaque bearer token; only its hash is stored. */
export function createSession(db: DB, userId: string, name: string): { token: string; sessionId: string } {
  const token = `ow_${crypto.randomBytes(32).toString('base64url')}`;
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, userId, tokenHash, name, createdAt, lastUsedAt) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, userId, sha256(token), name.slice(0, 100), now, now);
  return { token, sessionId };
}

export function userForToken(db: DB, token: string): (User & { sessionId: string }) | undefined {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.isAdmin, u.createdAt, s.id AS sessionId, s.lastUsedAt
       FROM sessions s JOIN users u ON u.id = s.userId WHERE s.tokenHash = ?`,
    )
    .get(sha256(token)) as (User & { sessionId: string; lastUsedAt: number }) | undefined;
  if (!row) return undefined;
  const now = Date.now();
  if (now - row.lastUsedAt > 60_000) db.prepare(`UPDATE sessions SET lastUsedAt = ? WHERE id = ?`).run(now, row.sessionId);
  const { lastUsedAt: _ignored, ...user } = row;
  return user;
}

/** Tiny fixed-window rate limiter for login/registration attempts. */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.reset < now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    h.count++;
    return h.count <= this.limit;
  }
  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
  }
}
