// api/generate.js
import { Redis } from "@upstash/redis";

/* ----------------------------- Redis client ----------------------------- */
function redisClient() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/* ----------------------------- Konstanta/env ---------------------------- */
const MAX_USERS = Number(process.env.MAX_USERS || 50);
const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const FALLBACK_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-pro",
].filter((m) => m !== PRIMARY_MODEL);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/* -------------------------------- Utils -------------------------------- */
const slugify = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function buildPrompt({ variations, topik, deskripsi, linkProduk, gaya, panjang }) {
  return `
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
}`.trim();
}

function parseGeminiTextToJSON(text) {
  if (!text) throw new Error("Model tidak mengembalikan teks.");
  let raw = String(text).replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Format balikan model tidak sesuai (tanpa 'scripts').");
  }
}

/* ----------------------- Panggilan Gemini + Retry ---------------------- */
async function callGeminiOnce({ model, prompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.9, topP: 0.9 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();

  if (!res.ok) {
    const err = new Error(`Gemini error (${res.status}): ${bodyText}`);
    err.status = res.status;
    throw err;
  }

  const j = JSON.parse(bodyText);
  const text =
    j?.candidates?.[0]?.content?.parts?.map((p) => p?.text).join("") ||
    j?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "";

  const parsed = parseGeminiTextToJSON(text);
  if (!parsed || !Array.isArray(parsed.scripts)) {
    throw new Error("Format balikan model tidak sesuai (tanpa 'scripts').");
  }
  return parsed.scripts;
}

async function callGeminiWithRetry({ prompt }) {
  if (!GEMINI_API_KEY) {
    // Fallback dev agar UI tetap jalan
    return [
      {
        title: "Contoh 1",
        content:
          "Ini contoh hasil dummy karena API Key kosong. Tambahkan GEMINI_API_KEY di environment untuk hasil asli.",
      },
    ];
  }

  const all = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  let lastErr = null;

  for (const model of all) {
    for (let i = 0; i < 3; i++) {
      try {
        return await callGeminiOnce({ model, prompt });
      } catch (e) {
        lastErr = e;
        const retriable = [429, 500, 502, 503, 504].includes(e?.status);
        if (!retriable || i === 2) break;
        const base = 1000 * Math.pow(2, i); // 1s,2s,4s
        const jitter = Math.floor(Math.random() * 350);
        await delay(base + jitter);
      }
    }
  }
  throw lastErr || new Error("Gagal memanggil model AI.");
}

/* -------------------------------- Handler ------------------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  const b = typeof req.body === "object" ? req.body : {};
  // Nama TIDAK wajib lagi — default "guest"
  const userName = String(b.userName || b.nama || "guest").trim();
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

  // Validasi minimal
  if (!linkProduk)
    return res
      .status(400)
      .json({ ok: false, message: "linkProduk wajib diisi." });
  if (!topik)
    return res
      .status(400)
      .json({ ok: false, message: "Nama/Jenis Produk wajib diisi." });
  if (!deskripsi || deskripsi.length < 1)
    return res
      .status(400)
      .json({ ok: false, message: "Minimal 1 kelebihan/keunggulan." });

  // Redis + batas pengguna (best-effort)
  const redis = redisClient();
  const userIdBase = userName !== "guest" ? userName : `guest-${topik || "anon"}`;
  const userId = slugify(userIdBase);
  const USERS_SET = "aff:users";
  const date = todayStr();

  if (redis) {
    try {
      const count = await redis.scard(USERS_SET);
      const isMember = await redis.sismember(USERS_SET, userId);
      if (!isMember && count >= MAX_USERS) {
        return res
          .status(403)
          .json({ ok: false, message: "Slot pengguna telah penuh. Hubungi admin." });
      }
    } catch {}
  }

  // Bangun prompt & panggil Gemini (dengan retry/fallback)
  const prompt = buildPrompt({
    variations: jumlah,
    topik,
    deskripsi,
    linkProduk,
    gaya,
    panjang,
  });

  let scripts = null;
  try {
    scripts = await callGeminiWithRetry({ prompt });
  } catch (e) {
    const code = e?.status || 500;
    const friendly =
      code === 503 || code === 429
        ? "⚠️ Server AI sedang sibuk. Silakan coba lagi sebentar lagi."
        : e?.message || "Terjadi kesalahan saat memproses permintaan.";
    return res.status(code).json({ ok: false, message: friendly });
  }

  // Catat penggunaan (best-effort)
  if (redis) {
    try {
      await redis.incr(`aff:global:used:${date}`);
      await redis.incr(`aff:user:used:${date}:${userId}`);
      await redis.hset(`aff:user:meta:${userId}`, {
        name: userName,
        topic: topik,
        createdAt: Date.now(),
      });
      await redis.sadd(USERS_SET, userId);
    } catch (e) {
      console.error("Redis write failed:", e?.message || e);
    }
  }

  return res.status(200).json({
    ok: true,
    modelUsed: PRIMARY_MODEL,
    scripts: scripts || [],
  });
}
