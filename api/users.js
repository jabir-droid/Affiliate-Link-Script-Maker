// /api/users.js
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

const MAX_USERS = Number(process.env.MAX_USERS || 50);     // batasi 50 org default
const USERS_SET = 'aff:users';                              // set berisi id user (slug)

function slugifyName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'user';
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { name } = await readJson(req);
      if (!name || !name.trim()) {
        return res.status(400).json({ ok: false, message: 'Nama wajib diisi.' });
      }

      const id = slugifyName(name);
      const metaKey = `aff:user:meta:${id}`;

      // Cek kapasitas user (limit 50)
      const current = await redis.scard(USERS_SET);
      if (current >= MAX_USERS) {
        return res.status(403).json({ ok: false, message: 'Kuota pengguna sudah penuh.' });
      }

      // Daftarkan ke SET (tidak masalah kalau sudah ada – SADD idempotent)
      await redis.sadd(USERS_SET, id);

      // Simpan metadata user sekali saja (SET NX) → TIDAK ADA argumen null
      await redis.set(
        metaKey,
        JSON.stringify({ name: name.trim(), createdAt: Date.now() }),
        { nx: true } // hanya kalau belum ada
      );

      return res.json({ ok: true, id, name: name.trim() });
    }

    if (req.method === 'GET') {
      // List semua user + meta ringkas
      const ids = await redis.smembers(USERS_SET);
      const keys = ids.map(id => `aff:user:meta:${id}`);
      const metas = keys.length ? await redis.mget(...keys) : [];
      const users = ids.map((id, i) => {
        let meta = null;
        try { meta = metas[i] ? JSON.parse(metas[i]) : null; } catch {}
        return { id, ...(meta || {}) };
      });
      return res.json({ ok: true, count: users.length, users, max: MAX_USERS });
    }

    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, message: String(err?.message || err) });
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
  });
}
