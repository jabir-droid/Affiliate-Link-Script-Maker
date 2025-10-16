// api/generate.js
import { Redis } from "@upstash/redis";

/* ---------- Redis optional client ---------- */
function redisClient() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/* ---------- Config ---------- */
const MAX_USERS = Number(process.env.MAX_USERS || 50);
/** Default ke model yang valid untuk generateContent (v1beta): */
const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
/** Daftar fallback yang juga mendukung generateContent (tanpa gemini-pro) */
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-lite",
].filter((m) => m !== PRIMARY_MODEL);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/* ---------- Utils ---------- */
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
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- Core ---------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  const b = typeof req.body === "object" ? req.body : {};
  // userName kini opsional; kalau tidak ada kita set "anon"
  const userName = String(b.userName || b.nama || "").trim() || "anon";
  const linkProduk = String(b.linkProduk || b.link || "").trim();
  const topik = String(b.topik || b.topic || "").trim();

  // dukung dua nama properti utk kelebihan
  const deskripsi = Array.isArray(b.deskripsi)
    ? b.deskripsi
    : Array.isArray(b.descriptions)
    ? b.descriptions
    : [];

  const gaya = String(b.gaya || b.style || "Santai & Ramah");
  const panjang = String(b.panjang || b.length || "Sedang (2-3 paragraf)");
  const jumlah = Math.max(
    1,
    Math.min(10, Number(b.jumlah || b.count || b.generateCount || 1))
  );

  // Validasi minimal yang disepakati
  if (!linkProduk)
    return res
      .status(400)
      .json({ ok: false, message: "linkProduk wajib diisi." });
  if (!topik)
    return res
      .status(400)
      .json({ ok: false, message: "Nama/Jenis Produk wajib diisi." });
  if (!deskripsi || deskripsi.length < 1)
    return res.status(400).json({
      ok: false,
      message: "Minimal 1 kelebihan/keunggulan.",
    });

  // Batasi jumlah user unik jika Redis tersedia (opsional)
  const redis = redisClient();
  const userId = slugify(userName); // bisa "anon"
  const USERS_SET = "aff:users";
  const date = todayStr();

  if (redis && userId !== "anon") {
    try {
      const count = await redis.scard(USERS_SET);
      const isMember = await redis.sismember(USERS_SET, userId);
      if (!isMember && count >= MAX_USERS) {
        return res.status(403).json({
          ok: false,
          message: "Slot pengguna telah penuh. Hubungi admin.",
        });
      }
    } catch {
      // abaikan jika Redis bermasalah
    }
  }

  /* ---------- Prompt ---------- */
  const prompt = `
Tulis ${jumlah} variasi skrip promosi afiliasi dalam bahasa Indonesia.
Produk: ${topik}
Kelebihan: ${deskripsi.join(", ")}
Link: ${linkProduk}
Gaya: ${gaya}
Panjang: ${panjang}

KELUARAN HARUS JSON valid tanpa teks lain:
{
  "scripts": [
    { "title": "Judul Variasi 1", "content": "Isi copy 1 (multi-paragraf boleh)" }
  ]
}
  `.trim();

  /* ---------- Panggil Gemini ---------- */
  let scripts = null;

  async function callGeminiModel(model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, topP: 0.9 },
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const textBody = await r.text();

    // Response tidak OK -> lempar error dengan body mentah
    if (!r.ok) {
      const err = new Error(
        `Gemini error (${r.status}): ${textBody || r.statusText}`
      );
      err.status = r.status;
      throw err;
    }

    // Parse kandidat
    let j;
    try {
      j = textBody ? JSON.parse(textBody) : null;
    } catch {
      throw new Error(`Gagal parse JSON dari Gemini: ${textBody?.slice(0, 200)}`);
    }

    const text =
      j?.candidates?.[0]?.content?.parts?.map((p) => p?.text).join("") ||
      j?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";

    // Model kadang mengembalikan codefence
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
    return parsed.scripts;
  }

  try {
    if (!GEMINI_API_KEY) {
      // fallback dummy agar UI tetap jalan saat dev-local
      scripts = Array.from({ length: jumlah }).map((_, i) => ({
        title: `Variasi ${i + 1} • ${topik}`,
        content: `Contoh skrip (${i + 1}) untuk ${topik}\n\n${deskripsi.join(
          " • "
        )}\n\n${linkProduk}`,
      }));
    } else {
      const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS];

      /** Retry policy kecil untuk 429/503 per model */
      let lastErr = null;
      for (const model of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            scripts = await callGeminiModel(model);
            // Catat model yang dipakai kalau ingin
            break;
          } catch (e) {
            lastErr = e;
            // Retry hanya untuk 429/503
            const status = e?.status || 0;
            if (status === 429 || status === 503) {
              // backoff singkat
              await new Promise((r) =>
                setTimeout(r, attempt === 0 ? 600 : 1200)
              );
              continue;
            }
            // error lain: coba model berikutnya
            break;
          }
        }
        if (scripts) break;
      }
      if (!scripts) throw lastErr || new Error("Gagal memanggil model Gemini.");
    }
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: String(e?.message || e),
    });
  }

  /* ---------- Catat pemakaian (tidak memblokir) ---------- */
  if (redis) {
    try {
      await redis.incr(`aff:global:used:${date}`);
      await redis.incr(`aff:user:used:${date}:${userId}`);
      await redis.hset(`aff:user:meta:${userId}`, {
        name: userName,
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
