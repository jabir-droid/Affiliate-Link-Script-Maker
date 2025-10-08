// api/usage.js
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.AFFILIATE_SCRIPT_KV_REST_API_URL,
  token: process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN,
});

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

/** Scan helper untuk ambil semua keys yang match pattern */
async function scanAll(pattern, count = 200) {
  let cursor = 0;
  const keys = [];
  // Upstash: scan(cursor, { match, count })
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count });
    cursor = Number(next);
    if (Array.isArray(batch) && batch.length) keys.push(...batch);
  } while (cursor !== 0);
  return keys;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Method not allowed' });

    // Simple admin guard
    if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const limit = Number(process.env.QUOTA_DAILY_LIMIT || 1000);

    // Global Usage
    const globalUsed = Number((await redis.get(`usage:${today}:global`)) || 0);

    // Daftar user yang diizinkan (opsi simple: set 'users')
    const users = (await redis.smembers('users')) || [];
    const activeCount = users.length || Number(process.env.ESTIMATED_USERS || 100);

    // Ambil semua key usage user hari ini
    const usageKeys = await scanAll(`usage:${today}:user:*`, 500);

    // Map key → userId
    const userFromKey = (k) => k.split(':').slice(-1)[0];

    let perUser = [];
    if (usageKeys.length) {
      const vals = await redis.mget(...usageKeys);
      perUser = usageKeys.map((k, i) => ({
        userId: userFromKey(k),
        used: Number(vals?.[i] || 0),
      }));
    }

    // Gabungkan user dari set `users` yang mungkin belum punya pemakaian hari ini
    const usedIds = new Set(perUser.map((u) => u.userId));
    users.forEach((u) => {
      if (!usedIds.has(u)) perUser.push({ userId: u, used: 0 });
    });

    // Hitung sisa & kuota per user (otomatis dibagi pengguna aktif)
    const remainingGlobal = Math.max(0, limit - globalUsed);
    const perUserQuota = Math.floor(remainingGlobal / Math.max(1, activeCount));

    return res.json({
      ok: true,
      date: today,
      limit,
      global: {
        used: globalUsed,
        remaining: remainingGlobal,
      },
      users: {
        totalRegistered: users.length,
        estimatedActive: activeCount,
        perUserQuota,
        perUser, // [{ userId, used }]
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message || 'Internal error' });
  }
}
