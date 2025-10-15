// /api/generate.js
import { Redis } from "@upstash/redis";

/* ---------- helpers ---------- */
function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
const MAX_USERS = Number(process.env.MAX_USERS || 50);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function slugify(s) {
  return String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
async function readJsonBody(req) {
  if (typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
function getAnonUserId(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim();
  const ua = (req.headers["user-agent"] || "").toString().slice(0, 40);
  return slugify(fwd || ua || "anon");
}

/* ---------- handler ---------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  let b = {};
  try { b = await readJsonBody(req); }
  catch { return res.status(400).json({ ok:false, message:"Body bukan JSON valid" }); }

  // ⬇️ userName tidak wajib lagi
  const userName = String(b.userName || b.nama || "").trim() || null;
  const linkProduk = String(b.linkProduk || b.link || "").trim();
  const topik = String(b.topik || b.topic || "").trim();
  const deskripsi = Array.isArray(b.deskripsi) ? b.deskripsi
                    : Array.isArray(b.descriptions) ? b.descriptions : [];
  const gaya = String(b.gaya || b.style || "Gen Z");
  const panjang = String(b.panjang || b.length || "Sedang");
  const jumlah = Math.max(1, Math.min(8, Number(b.jumlah || b.count || b.generateCount || 1)));

  // Validasi minimal
  if (!linkProduk) return res.status(400).json({ ok:false, message:"linkProduk wajib diisi." });
  if (!topik)      return res.status(400).json({ ok:false, message:"Nama/Jenis Produk wajib diisi." });
  if (deskripsi.length < 2) return res.status(400).json({ ok:false, message:"Minimal 2 kelebihan/keunggulan." });

  const redis = redisClient();
  const userId = slugify(userName) || getAnonUserId(req);
  const USERS_SET = "aff:users";
  const date = todayStr();

  // Batas pengguna unik (opsional, jika Redis tersedia)
  if (redis) {
    try {
      const count = await redis.scard(USERS_SET);
      const isMember = await redis.sismember(USERS_SET, userId);
      if (!isMember && count >= MAX_USERS) {
        return res.status(403).json({ ok:false, message:"Slot pengguna telah penuh. Hubungi admin." });
      }
    } catch {}
  }

  // Prompt ke Gemini
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
}`.trim();

  let scripts = null;
  try {
    if (!GEMINI_API_KEY) {
      // fallback dummy agar UI tetap jalan
      scripts = Array.from({ length: variations }).map((_, i) => ({
        title: `Variasi ${i + 1} • ${topik}`,
        content: `Contoh skrip (${i + 1}) untuk ${topik}\n\n${deskripsi.join(" • ")}\n\n${linkProduk}`,
      }));
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, topP: 0.9 } };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { const t = await r.text(); throw new Error(`Gemini error (${r.status}): ${t}`); }
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p)=>p?.text).join("") || j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let parsed = null;
      try { parsed = JSON.parse(text); }
      catch { parsed = JSON.parse(String(text).replace(/```json|```/g,"").trim()); }
      if (!parsed || !Array.isArray(parsed.scripts)) throw new Error("Format balikan model tidak sesuai (tanpa 'scripts').");
      scripts = parsed.scripts;
    }
  } catch (e) {
    return res.status(500).json({ ok:false, message: String(e?.message || e) });
  }

  // Catat pemakaian (non-blocking)
  if (redis) {
    try {
      await redis.incr(`aff:global:used:${date}`);
      await redis.incr(`aff:user:used:${date}:${userId}`);
      await redis.hset(`aff:user:meta:${userId}`, { name: userName || "anon", createdAt: Date.now() });
      await redis.sadd(USERS_SET, userId);
    } catch (e) { console.error("Redis write failed:", e?.message || e); }
  }

  return res.status(200).json({ ok:true, modelUsed: GEMINI_MODEL, scripts: scripts || [] });
}
