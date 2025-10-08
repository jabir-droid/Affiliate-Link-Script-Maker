// api/admin/revoke.js
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.AFFILIATE_SCRIPT_KV_REST_API_URL,
  token: process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN,
});

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });
    if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const { userId, token, todayReset } = await readJson(req);
    if (!userId && !token) {
      return res.status(400).json({ ok: false, message: 'userId atau token wajib diisi' });
    }

    const ops = [];

    if (userId) {
      // hapus dari daftar user yang diizinkan
      ops.push(redis.srem('users', userId));
      if (todayReset) {
        const today = new Date().toISOString().slice(0, 10);
        ops.push(redis.del(`usage:${today}:user:${userId}`));
      }
    }

    if (token) {
      // hapus mapping link:{token} jika kamu memakainya
      ops.push(redis.del(`link:${token}`));
    }

    await Promise.all(ops);

    return res.json({ ok: true, message: 'revoked/updated' });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message || 'Internal error' });
  }
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
