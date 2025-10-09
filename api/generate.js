// api/generate.js
import { Redis } from "@upstash/redis";

function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const MAX_USERS = Number(process.env.MAX_USERS || 50);
const QUOTA_DAILY_LIMIT = Number(process.env.QUOTA_DAILY_LIMIT || 1000);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function slugifyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2,"0")}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  const body = typeof req.body === "object" ? req.body : {};
  const userName  = String(body.userName || body.nama || "").trim();
  const linkProduk= String(body.linkProduk || body.link || "").trim();
  const topik     = String(body.topik || body.topic || "").trim();
  const deskripsi = Array.isArray(body.deskripsi) ? body.deskripsi : (Array.isArray(body.descriptions) ? body.descriptions : []);
  const gaya      = String(body.gaya || body.style || "Gen Z");
  const panjang   = String(body.panjang || body.length || "Sedang");
  const jumlah    = Math.max(1, Math.min(8, Number(body.jumlah || body.count || body.generateCount || 1)));

  if (!userName)  return res.status(400).json({ ok: false, message: "Nama wajib diisi." });
  if (!linkProduk)return res.status(400).json({ ok: false, message: "linkProduk wajib diisi." });
  if (!topik)     return res.status(400).json({ ok: false, message: "Nama/Jenis Produk wajib diisi." });
  if (!deskripsi || deskripsi.length < 2) return res.status(400).json({ ok: false, message: "Minimal 2 kelebihan/keunggulan." });

  const redis = getRedis();
  const userId = slugifyName(userName);
  const USERS_SET = "aff:users";
  const date = todayStr();

  // Enforce 50 user max jika Redis tersedia
  if (redis) {
    try {
      const count = await redis.scard(USERS_SET);
      const isMember = await redis.sismember(USERS_SET, userId);
      if (!isMember && count >= MAX_USERS) {
        return res.status(403).json({ ok: false, message: "Slot pengguna telah penuh. Hubungi admin." });
      }
    } catch {}
  }

  // Siapkan prompt (instruksikan output HARUS JSON murni)
  const prompt = `
Tulis ${jumlah} variasi skrip promosi afiliasi dalam bahasa Indonesia.
Produk: ${topik}
Kelebihan: ${deskripsi.join(", ")}
Link: ${linkProduk}
Gaya: ${gaya}
Panjang: ${panjang}

Format keluaran HARUS JSON valid, tanpa teks lain:
{
  "scripts": [
    { "title": "Judul Variasi 1", "content": "Isi copy 1 (multi-paragraf boleh)" },
    ...
  ]
}
`;

  let modelResult = null;

  try {
    if (!GEMINI_API_KEY) {
      // Fallback dev: tanpa API key, kembalikan dummy biar UI tetap jalan
      modelResult = {
        scripts: Array.from({ length: jumlah }).map((_, i) => ({
          title: `Variasi ${i+1} • ${topik}`,
          content: `Contoh skrip (${i+1}) untuk ${topik}\n\n${deskripsi.join(" • ")}\n\n${linkProduk}`
        }))
      };
    } else {
      // Panggil Google AI Studio (Generative Language API v1beta)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;

      const payload = {
        contents: [
          { role: "user", parts: [{ text: prompt }] }
        ],
        generationConfig: {
          temperature: 0.9,
          topP: 0.9
        }
        // Biarkan safety_settings default agar tidak error enum.
      };

      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Gemini error (${r.status}): ${errText}`);
      }

      const j = await r.json();
      const text =
        j?.candidates?.[0]?.content?.parts?.map(p => p?.text).join("") ||
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
        throw new Error("Format balikan model tidak sesuai (tidak ada 'scripts').");
      }

      modelResult = { scripts: parsed.scripts };
    }
  } catch (e) {
    return res.status(500).json({ ok: false, message: String(e?.message || e) });
  }

  // Catat pemakaian (global + per-user) bila Redis tersedia
  if (redis) {
    try {
      await redis.incr(`aff:global:used:${date}`);
      await redis.incr(`aff:user:used:${date}:${userId}`);
      await redis.hsetnx(`aff:user:meta:${userId}`, { name: userName, createdAt: Date.now() });
      await redis.sadd(USERS_SET, userId);
    } catch {}
  }

  return res.status(200).json({
    ok: true,
    modelUsed: GEMINI_MODEL,
    scripts: modelResult.scripts || []
  });
}
