// api/generate.js
// v1 REST — Multi-variations (1..5), product-aware, CTA enforced, robust parsing
// Field yang didukung dari UI: linkProduk, deskripsi, gaya, panjang, jumlah
// Back-compat: topicHint/customSummary/count juga tetap diterima
//
// ENV yang dibutuhkan (Vercel -> Settings -> Environment Variables):
// - GEMINI_API_KEY (WAJIB)
// - GEMINI_MODEL (opsional, default: "gemini-2.0-flash"; bisa pakai "gemini-2.5-flash-lite")
// - ALLOWED_ORIGIN (opsional, default: "*")

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const VERSION = "v1-multi-r10";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed", version: VERSION });
  }

  try {
    // ----- input dari UI -----
    const body = req.body || {};
    const linkProduk = body.linkProduk;
    if (!linkProduk) return res.status(400).json({ error: "linkProduk wajib diisi", version: VERSION });

    // alias/back-compat
    const deskripsi  = body.deskripsi || body.customSummary || "";
    const topicHint  = body.topicHint || "";            // opsional (kalau suatu saat dipakai lagi)
    const gaya       = body.gaya || "Gen Z";
    const panjang    = body.panjang || "Sedang";
    const totalReq   = Number(body.jumlah || body.count || 1);
    const total      = Math.max(1, Math.min(totalReq, 5)); // batasi 1..5

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server belum diset GEMINI_API_KEY", version: VERSION });

    // ----- ambil info halaman (title/meta/h1/p) -----
    const pageInfo = await getPageInfo(linkProduk);

    // ----- prefer panjang -----
    const prefer = String(panjang).toLowerCase();
    const targetKata =
      prefer.includes("pendek") ? "≈ 50 kata" :
      prefer.includes("panjang") ? "≥ 300 kata" : "≈ 150 kata";

    // helper untuk satu variasi
    const makeOne = async (idx) => {
      const variationNote = `Ini variasi ke-${idx} dengan sudut pandang & diksi yang berbeda. Hindari pengulangan frasa dari variasi lain.`;

      const rules = `
Tulis satu skrip promosi afiliasi berbahasa Indonesia dengan vibes ${gaya}: santai, hangat, persuasif, tidak kaku.
Gunakan konteks berikut (prioritas: deskripsi pengguna > info halaman > penalaran URL):

DARI PENGGUNA:
- Topik/jenis (opsional): ${topicHint || "-"}
- Deskripsi singkat: ${deskripsi || "-"}

DARI HALAMAN:
${pageInfo}

BATASAN GAYA:
- Tanpa markdown (tanpa **, *, #, -, 1., >) dan tanpa bullet/list.
- Gunakan paragraf mengalir.
- Emoji maksimal 2.
- Baris pertama HARUS judul singkat & catchy (1 baris).
- Akhiri PERSIS dengan: "Klik link ini 👉 ${linkProduk}"
- Hindari klaim berlebihan atau spesifikasi yang tidak disebut.

DIVERSIFIKASI & DIKSI:
- ${variationNote}
- Hindari kata-kata templatey yang berulang (mis. “auto stylish”, “bikin pede”) kecuali relevan alami.
- Gunakan sinonim modern namun wajar; sesuaikan tone dengan kategori produk (fashion/elektronik/peralatan rumah/dll).

PANJANG:
- Target panjang: ${targetKata}

OUTPUT:
- Keluarkan TEKS BIASA: 1) Judul (baris 1), 2) 1–3 paragraf isi, 3) CTA persis di atas.
`.trim();

      const example = `
Contoh nuansa (jangan disalin mentah):
Gaya Naik Level Tanpa Drama ✨
Buat yang pengin tampil rapi tapi tetap nyaman, ini pilihan aman. Detailnya bersih, potongannya enak dilihat, dan gampang di-mix & match. Rasakan bedanya waktu dipakai harian.

Klik link ini 👉 ${linkProduk}
`.trim();

      const payload = {
        contents: [
          { role: "user", parts: [{ text: rules }] },
          { role: "user", parts: [{ text: example }] }
        ],
        generationConfig: {
          temperature: 0.85 + Math.random() * 0.15, // variasi halus antar hasil
          topK: 50,
          topP: 0.9,
          maxOutputTokens: 1024
        }
      };

      const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload)
      });

      const raw = await resp.text();
      if (!resp.ok) throw new Error(`Gemini error (${resp.status}): ${raw.slice(0, 600)}`);

      let data = null;
      try { data = JSON.parse(raw); } catch {}
      const text = extractText(data);
      if (!text) throw new Error(`No text in response: ${raw.slice(0, 600)}`);

      // Bersihkan & pastikan CTA ada
      const tidy = s => (s || "")
        .replace(/^\s*[-*•]\s+/gm, "")   // buang bullet kalau ada
        .replace(/[`*_~#>]+/g, "")       // buang markup
        .replace(/\n{3,}/g, "\n\n")      // rapikan enter
        .trim();

      let clean = tidy(text);
      const CTA = `Klik link ini 👉 ${linkProduk}`;
      if (!clean.includes(CTA)) {
        clean = clean.replace(/Klik link ini.+$/m, "").trim();
        clean = `${clean}\n\n${CTA}`;
      }
      return clean;
    };

    // Generate beberapa variasi (berurutan agar stabil)
    const results = [];
    for (let i = 1; i <= total; i++) {
      try {
        results.push(await makeOne(i));
      } catch (e) {
        results.push(`(Variasi ${i} gagal: ${String(e).slice(0,300)})\n\nKlik link ini 👉 ${linkProduk}`);
      }
    }

    return res.status(200).json({
      version: VERSION,
      count: total,
      result: results,         // <-- UI kamu membaca data.result (array)
      pageInfo,
      used: { deskripsi, topicHint, gaya, panjang }
    });

  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e), version: VERSION });
  }
}

/* -------------------- Helpers -------------------- */

function extractText(data) {
  const cands = data?.candidates || [];
  for (const c of cands) {
    const parts = c?.content?.parts;
    if (Array.isArray(parts)) {
      const t = parts.map(p => p?.text || "").join("\n").trim();
      if (t) return t;
    }
    const t2 = c?.content?.parts?.[0]?.text;
    if (t2 && t2.trim()) return t2.trim();
  }
  return "";
}

async function getPageInfo(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await r.text();

    const title = (html.match(/<title>(.*?)<\/title>/i)?.[1] || "").trim();
    const meta  = (html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i)?.[1] || "").trim();
    const h1    = (html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] || "").replace(/<[^>]+>/g,"").trim();
    const p1    = (html.match(/<p[^>]*>(.*?)<\/p>/i)?.[1] || "").replace(/<[^>]+>/g,"").trim();

    let info = "";
    if (title) info += `Judul halaman: ${title}\n`;
    if (meta)  info += `Deskripsi: ${meta}\n`;
    if (!meta && h1) info += `Heading utama: ${h1}\n`;
    if (!meta && !h1 && p1) info += `Paragraf awal: ${p1}\n`;

    if (!info) info = "(Tidak ada meta yang jelas; gunakan deskripsi dari pengguna & tebak dari URL)";
    if (info.length > 700) info = info.slice(0, 700) + "...";
    return info;
  } catch {
    return "(Gagal mengambil isi halaman; gunakan deskripsi dari pengguna & tebak dari URL)";
  }
}
