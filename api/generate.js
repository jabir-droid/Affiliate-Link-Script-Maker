// /api/generate.js
import { redis } from "../lib/kv.js";
import { getClientIp, assertAllowedOrigin, setCors, readJson, j } from "./_shared.js";

const MAX_GLOBAL_PER_DAY = Number(process.env.MAX_GLOBAL_PER_DAY || 1000);
const ESTIMATED_USERS   = Number(process.env.ESTIMATED_USERS || 100);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = process.env.GEMINI_MODEL || "models/gemini-2.5-flash";

async function computePerUserCap(activeSetKey) {
  const active = await redis.scard(activeSetKey);
  const users  = Math.max(active || 0, ESTIMATED_USERS);
  const cap    = Math.max(1, Math.floor(MAX_GLOBAL_PER_DAY / users));
  return { users, perUserCap: cap };
}

async function globalUsedToday(globalKey) {
  return Number((await redis.get(globalKey)) || 0);
}

export default async function handler(req, res) {
  try {
    // Origin allow-list + CORS
    const allowedOrigin = assertAllowedOrigin(req);
    setCors(res, allowedOrigin);
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

    if (req.method !== "POST") return j(res, 405, { ok:false, msg:"Method Not Allowed" });

    if (!GEMINI_API_KEY) return j(res, 500, { ok:false, msg:"GEMINI_API_KEY kosong di ENV" });

    // Body & validasi Wajib
    const body = await readJson(req);
    const {
      linkProduk,
      gaya = "Gen Z",
      panjang = "Sedang",
      jumlah = 2,
      // kolom wajib baru:
      namaLink,             // “link ini bahas apa?”
      deskripsiSingkat1,    // kelebihan #1
      deskripsiSingkat2     // kelebihan #2
    } = body;

    if (!linkProduk) return j(res, 400, { ok:false, msg:"linkProduk wajib diisi" });
    if (!namaLink || !deskripsiSingkat1 || !deskripsiSingkat2) {
      return j(res, 400, { ok:false, msg:"Isi 'Link ini bahas apa', 'Deskripsi singkat #1' dan 'Deskripsi singkat #2' (wajib)." });
    }

    // Keys Redis per hari
    const today = new Date().toISOString().slice(0,10);
    const ip    = getClientIp(req);

    const keyUser     = `usage:${today}:ip:${ip}`;
    const keyGlobal   = `usage:${today}:global`;
    const keyActive   = `active:${today}:ipset`;
    const TTL         = 60*60*24;

    // Kuota global
    const gUsed = await globalUsedToday(keyGlobal);
    if (gUsed >= MAX_GLOBAL_PER_DAY) {
      return j(res, 429, { ok:false, where:"quota", msg:"Kuota global hari ini sudah habis. Coba lagi besok." });
    }

    // Daftarkan IP aktif & hitung batas personal
    await redis.sadd(keyActive, ip);
    await redis.expire(keyActive, TTL);
    const { users, perUserCap } = await computePerUserCap(keyActive);

    // Kuota personal
    let usedByUser = Number((await redis.get(keyUser)) || 0);
    if (usedByUser >= perUserCap) {
      return j(res, 429, { ok:false, where:"quota", msg:`Kuota harian kamu habis (${perUserCap}/hari).` });
    }

    // Naikkan counter
    usedByUser = await redis.incr(keyUser);
    await redis.expire(keyUser, TTL);
    const newGlobal = await redis.incr(keyGlobal);
    await redis.expire(keyGlobal, TTL);

    // Prompt Gemini
    const prompt =
`Buat ${jumlah} variasi skrip promosi affiliate berbahasa Indonesia.
Gaya ${gaya}, panjang ${panjang}. Tanpa bullet/markdown.
Topik/link ini membahas: ${namaLink}.
Sorot kelebihan:
1) ${deskripsiSingkat1}
2) ${deskripsiSingkat2}
Selalu akhiri dengan CTA "Klik link ini 👉 ${linkProduk}".
Gunakan bahasa natural, santai, tidak repetitif, vibes anak muda.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 800 }
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) }
    );

    if (!resp.ok) {
      // rollback kuota jika panggilan AI gagal
      await redis.decr(keyUser);
      await redis.decr(keyGlobal);
      const detail = await resp.text();
      return j(res, resp.status, { ok:false, where:"ai", msg:"Gagal menghubungi Gemini", detail });
    }

    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      await redis.decr(keyUser);
      await redis.decr(keyGlobal);
      return j(res, 500, { ok:false, where:"ai", msg:"Tidak ada output dari model" });
    }

    return j(res, 200, {
      ok: true,
      result: text,
      quota: {
        personal_used: usedByUser,
        personal_cap: perUserCap,
        personal_remaining: Math.max(0, perUserCap - usedByUser),
        global_used: newGlobal,
        global_cap: MAX_GLOBAL_PER_DAY,
        global_remaining: Math.max(0, MAX_GLOBAL_PER_DAY - newGlobal),
        active_users_estimated: Math.max(await redis.scard(`active:${today}:ipset`) || 0, ESTIMATED_USERS)
      }
    });
  } catch (e) {
    return j(res, e.status || 500, { ok:false, msg: e.message || "Server error" });
  }
}
