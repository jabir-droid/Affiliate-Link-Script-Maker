// /api/quota.js
import { Redis } from '@upstash/redis';

const DAILY_LIMIT =
  Number(process.env.QUOTA_DAILY_LIMIT || process.env.MAX_GLOBAL_PER_DAY || 1000);

function todayKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `quota:${y}-${m}-${dd}`;
}

function connectRedis() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export default async function handler(req, res) {
  try {
    const redis = connectRedis();
    if (!redis) {
      return res.status(200).json({
        ok: true,
        connected: false,
        hint: 'Upstash Redis belum dikonfigurasi (pakai env KV_REST_API_URL & KV_REST_API_TOKEN). Menampilkan angka dummy.',
        limit: DAILY_LIMIT,
        used: 0,
        remaining: DAILY_LIMIT
      });
    }
    const key = todayKey();
    const used = Number(await redis.get(key)) || 0;
    return res.status(200).json({
      ok: true,
      connected: true,
      limit: DAILY_LIMIT,
      used,
      remaining: Math.max(0, DAILY_LIMIT - used)
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
