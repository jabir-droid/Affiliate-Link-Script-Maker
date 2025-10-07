// /api/generate.js
// Vercel Serverless API untuk Google Generative Language API v1 (AI Studio)
// - Model default: models/gemini-2.5-flash-lite
// - Robust: raw-body fallback, sanitize ```json fences, error detail
// - Kuota harian: increment 1x per request sukses (Upstash Redis, optional)

import { Redis } from '@upstash/redis';

const MODEL = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash-lite';
const API_KEY = process.env.GEMINI_API_KEY;

const HAVE_REDIS = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const redis = HAVE_REDIS ? new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
}) : null;

const DAILY_LIMIT = Number(process.env.QUOTA_DAILY_LIMIT || 1000);

function send(res, code, payload) { res.status(code).json(payload); }
function bad(res, code, message) { send(res, code, { ok: false, message }); }

function arrayify(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  return String(x).split(/[;,]\s*/g).map(s => s.trim()).filter(Boolean);
}

async function readRawJson(req) {
  return new Promise((resolve) => {
    try {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        if (!data) return resolve({});
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
      req.on('error', () => resolve({}));
    } catch {
      resolve({});
    }
  });
}

// Helpers kuota (WIB)
function getJakartaTodayKey() {
  const nowUtc = Date.now();
  const wib = new Date(nowUtc + 7 * 60 * 60 * 1000);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const d = String(wib.getUTCDate()).padStart(2, '0');
  return `usage:${y}-${m}-${d}`;
}
function getResetEpochWibNextMidnightSec() {
  const nowUtc = Date.now();
  const wib = new Date(nowUtc + 7 * 60 * 60 * 1000);
  const next = new Date(Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate() + 1,
    0,0,0,0
  ));
  const resetUtcMs = next.getTime() - 7 * 60 * 60 * 1000;
  return Math.floor(resetUtcMs / 1000);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return bad(res, 405, 'Method Not Allowed');
  }
  if (!API_KEY) return bad(res, 500, 'Server missing GEMINI_API_KEY');

  // --- parse body (obj | string | raw)
  let body = {};
  try {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (typeof req.body === 'string') {
      body = JSON.parse(req.body || '{}');
    } else {
      body = await readRawJson(req);
    }
  } catch { body = {}; }

  const linkProduk = (body.linkProduk || body.link || '').trim?.() || '';
  const topik      = (body.topik || body.topic || '').trim?.() || '';
  const gaya       = (body.gaya || body.style || 'Gen Z').trim?.() || 'Gen Z';
  const panjang    = (body.panjang || body.length || 'Sedang').trim?.() || 'Sedang';
  const count      = Math.max(1, Math.min(5, Number(body.jumlah || body.generateCount || body.count || 3)));
  const deskripsi  = arrayify(body.deskripsi || body.descriptions);

  // --- cek kuota sebelum lanjut (opsional)
  if (HAVE_REDIS) {
    const key = getJakartaTodayKey();
    const used = Number(await redis.get(key) || 0);
    if (used >= DAILY_LIMIT) {
      return bad(res, 429, 'Kuota harian sudah habis. Coba lagi besok.');
    }
  }

  // --- validasi input
  if (!linkProduk) return bad(res, 400, 'INVALID_INPUT: linkProduk wajib diisi.');
  if (!topik)      return bad(res, 400, 'INVALID_INPUT: topik/poin utama wajib diisi.');
  if (deskripsi.length < 2) return bad(res, 400, 'INVALID_INPUT: minimal 2 deskripsi singkat.');

  // --- prompt
  const system = [
    'Anda adalah penulis konten afiliasi berbahasa Indonesia.',
    'Tulis skrip promosi persuasif, natural, variatif (hindari bullet kaku).',
    'Selalu sertakan link produk pengguna.',
    `Gaya bahasa: ${gaya}`,
    `Target panjang: ${panjang}`,
    'Tambahkan CTA yang jelas, gunakan emoji 👉 sebelum link.'
  ].join('\n');

  const user = [
    `Buat ${count} variasi skrip afiliasi untuk: ${topik}`,
    `Link: ${linkProduk}`,
    `Deskripsi singkat: ${deskripsi.join(' | ')}`,
    '',
    'Balas dalam JSON VALID persis format:',
    `{"scripts":[{"title":"...","content":"..."}]}`,
    'JANGAN ada teks lain di luar JSON.'
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1/${MODEL}:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: system + '\n\n' + user }] }],
    generationConfig: { temperature: 0.9, topK: 40, topP: 0.95, maxOutputTokens: 1200 }
  };

  try {
    const fr = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });

    const raw = await fr.text();
    let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

    if (!fr.ok) {
      console.error('Gemini not ok', fr.status, raw);
      const msg =
        data?.error?.message ||
        data?.message ||
        (typeof raw === 'string' ? raw : JSON.stringify(raw));
      return send(res, fr.status, { ok: false, error: 'Gemini error', message: msg, detail: data || null });
    }
    if (!data) return bad(res, 502, 'Gemini returned empty/invalid JSON body');

    const rawText =
      data?.candidates?.[0]?.content?.parts?.find(p => typeof p?.text === 'string')?.text || '';

    function tryParseScripts(str) {
      if (!str) return null;
      let cleaned = String(str).trim();
      cleaned = cleaned.replace(/^\s*```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      cleaned = cleaned.replace(/^\s*```\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      try {
        const obj = JSON.parse(cleaned);
        if (obj && Array.isArray(obj.scripts) && obj.scripts.length) return obj;
      } catch (_) {}
      return null;
    }

    let parsed = tryParseScripts(rawText);
    if (!parsed) {
      try {
        const obj = JSON.parse(rawText);
        if (obj && Array.isArray(obj.scripts) && obj.scripts.length) parsed = obj;
      } catch (_) {}
    }
    if (!parsed) {
      const safeText = rawText && rawText.trim() ? rawText.trim() : 'Tidak ada keluaran.';
      parsed = { scripts: [{ title: 'Hasil', content: safeText }] };
    }

    // --- increment kuota (opsional, hanya jika sukses)
    if (HAVE_REDIS) {
      const key = getJakartaTodayKey();
      const used = Number(await redis.incr(key));
      // set EXPIREAT ke 00:00 WIB besok kalau key baru
      if (used === 1) {
        await redis.expireat(key, getResetEpochWibNextMidnightSec());
      }
    }

    return send(res, 200, {
      ok: true,
      model: MODEL,
      scripts: parsed.scripts,
      version: 'v1-flash-lite-robust+sanitized+quota'
    });
  } catch (err) {
    return bad(res, 500, `Gagal mengambil hasil dari Gemini: ${String(err)}`);
  }
}
