// /api/quota.js
// Tampilkan kuota harian berbasis Upstash Redis.
// Env yang dipakai:
// - KV_REST_API_URL, KV_REST_API_TOKEN  (WAJIB agar quota jalan)
// - QUOTA_DAILY_LIMIT (opsional, default 1000)
// Zona waktu: Asia/Jakarta (UTC+7), reset tiap 00:00 WIB.

import { Redis } from '@upstash/redis';

const HAVE_REDIS = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const redis = HAVE_REDIS ? new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
}) : null;

const DAILY_LIMIT = Number(process.env.QUOTA_DAILY_LIMIT || 1000);

function send(res, code, payload) { res.status(code).json(payload); }

function getJakartaTodayKey() {
  // Ambil tanggal di WIB (UTC+7)
  const nowUtc = Date.now();
  const wib = new Date(nowUtc + 7 * 60 * 60 * 1000);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const d = String(wib.getUTCDate()).padStart(2, '0');
  return `usage:${y}-${m}-${d}`; // ex: usage:2025-10-07
}

function getResetEpochWibNextMidnightSec() {
  const nowUtc = Date.now();
  const wib = new Date(nowUtc + 7 * 60 * 60 * 1000);
  const next = new Date(Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate() + 1, // besok
    0, 0, 0, 0
  ));
  // next di WIB, convert ke UTC epoch detik
  const resetUtcMs = next.getTime() - 7 * 60 * 60 * 1000;
  return Math.floor(resetUtcMs / 1000);
}

export default async function handler(req, res) {
  if (!HAVE_REDIS) {
    return send(res, 200, {
      ok: true,
      connected: false,
      hint: "Upstash Redis belum dikonfigurasi (pakai env KV_REST_API_URL & KV_REST_API_TOKEN). Menampilkan angka dummy.",
      limit: DAILY_LIMIT,
      used: 0,
      remaining: DAILY_LIMIT,
    });
  }

  try {
    const key = getJakartaTodayKey();
    const used = Number(await redis.get(key) || 0);
    const remaining = Math.max(0, DAILY_LIMIT - used);
    const resetAt = getResetEpochWibNextMidnightSec();

    return send(res, 200, {
      ok: true,
      connected: true,
      limit: DAILY_LIMIT,
      used,
      remaining,
      resetAtIso: new Date(resetAt * 1000).toISOString(),
    });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e) });
  }
}
