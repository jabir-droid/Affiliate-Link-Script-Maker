// /api/generate.js
import { Redis } from "@upstash/redis";
import { json, setCors, readJsonBody, requireSession } from "./_utils.js";

function redisClient() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const MAX_USERS = Number(process.env.MAX_USERS || 50);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  // 🔒 proteksi: wajib sesi
  const sess = await requireSession(req);
  if (!sess) return json(res, 401, { ok: false, message: "Unauthorized" });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return json(res, 405, { ok: false, message: "Method Not Allowed" });
  }

  let b;
  try { b = await readJsonBody(req); } 
  catch (e) { return json(res, 400, { ok:false, message: e.message }); }

  const userName = String(b.userName || b.nama || "").trim() || sess.user; // fallback ke user sesi
  const linkProduk = String(b.linkProduk || b.link || "").trim();
  const topik = String(b.topik || b.topic || "").trim();
  const deskripsi = Array.isArray(b.deskripsi)
    ? b.deskripsi
    : Array.isArray(b.descriptions)
    ? b.descriptions
    : [];
  const gaya = String(b.gaya || b.style || "Gen Z");
  const panjang = String(b.panjang || b.length || "Sedang");
  const jumlah = Math.max(
    1,
    Math.min(8, Number(b.jumlah || b.count || b.generateCount || 1))
  );

  if (!userName) return json(res, 400, { ok: false, message: "Nama wajib diisi." });
  if (!linkProduk) return json(res, 400, { ok: false, message: "linkProduk wajib diisi." });
  if (!topik) return json(res, 400, { ok: false, message: "Nama/Jenis Produk wajib diisi." });
  if (!deskripsi || deskripsi.length < 2)
    return json(res, 400, { ok: false, message: "Minimal 2 kelebihan/keunggulan." });

  const redis = redisClient();
  const userId = slugify(userName);
  const USERS_SET = "aff:users";
  const date = todayStr();

  if (redis) {
    try {
      const count = await redis.scard(USERS_SET);
      const isMember = await redis.sismember(USERS_SET, userId);
      if (!isMember && count >= MAX_USERS) {
        return json(res, 403, { ok:false, message:"Slot pengguna telah penuh. Hubungi admin." });
      }
    } catch {}
  }

  const variations = jumlah;
  const prompt = `
Tulis ${variations} variasi skrip promosi afiliasi dalam bahasa Indonesia.
Produk: ${topik}
Kelebihan: ${deskripsi.join(", ")}
Link: ${linkProduk}
Gaya: ${gaya}
Panjang: ${panjang}

Format keluaran HARUS JSON valid, tanpa teks lain:
{
  "scripts": [
    { "title": "Judul Variasi 1", "content": "Isi copy 1 (multi-paragraf boleh)" }
  ]
}
  `.trim();

  let scripts = null;

  try {
    if (!GEMINI_API_KEY) {
      scripts = Array.from({ length: variations }).map((_, i) => ({
        title: `Variasi ${i + 1} • ${topik}`,
        content: `Contoh skrip (${i + 1}) untuk ${topik}\n\n${deskripsi.join(" • ")}\n\n${linkProduk}`,
      }));
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        GEMINI_MODEL
      )}:generateContent?key=${GEMINI_API_KEY}`;

      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, topP: 0.9 }
      };

      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Gemini error (${r.status}): ${t}`);
      }

      const j = await r.json();
      const text =
        j?.candidates?.[0]?.content?.parts?.map((p) => p?.text).join("") ||
        j?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "";

      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        const cleaned = String(text).replace(/```json|```/g, "").trim();
        parsed = JSON.parse(cleaned);
      }
      if (!parsed || !Array.isArray(parsed.scripts)) {
        throw new Error("Format balikan model tidak sesuai (tanpa 'scripts').");
      }
      scripts = parsed.scripts;
    }
  } catch (e) {
    return json(res, 500, { ok:false, message: String(e?.message || e) });
  }

  if (redis) {
    try {
      await redis.incr(`aff:global:used:${date}`);
      await redis.incr(`aff:user:used:${date}:${userId}`);
      await redis.hset(`aff:user:meta:${userId}`, {
        name: userName,
        createdAt: Date.now(),
      });
      await redis.sadd("aff:users", userId);
    } catch (e) {
      console.error("Redis write failed:", e?.message || e);
    }
  }

  return json(res, 200, { ok: true, modelUsed: GEMINI_MODEL, scripts: scripts || [] });
}
