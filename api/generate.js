// api/generate.js
// v1-compliant, Gen Z tone, CTA wajib, ambil info halaman, MULTI-VARIASI (N hasil)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const VERSION = "v1-genz-cta-r9-multi";

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
    const { linkProduk, gaya, panjang, topicHint, customSummary, count } = req.body || {};
    if (!linkProduk) return res.status(400).json({ error: "linkProduk wajib diisi", version: VERSION });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server belum diset GEMINI_API_KEY", version: VERSION });

    const total = Math.max(1, Math.min(Number(count || 1), 5)); // 1..5

    // ---------- STEP 1: Ambil info halaman ----------
    const pageInfo = await getPageInfo(linkProduk);

    // ---------- STEP 2: Siapkan brief dasar ----------
    const prefer = String(panjang || "").toLowerCase();
    const targetKata =
      prefer.includes("pendek") ? "≈ 50 kata" :
      prefer.includes("panjang") ? "≥ 300 kata" : "≈ 150 kata";

    const topicLine = topicHint ? `Topik/jenis (pengguna): ${topicHint}\n` : "";
    const customLine = customSummary ? `Deskripsi singkat (pengguna): ${customSummary}\n` : "";

    // fungsi yang generate satu variasi
    const generateOne = async (idx) => {
      const variationNote = `Ini variasi ke-${idx}. Gunakan diksi/angle berbeda dibanding variasi lain.`;
      const rules = `
Tulis satu skrip promosi afiliasi berbahasa Indonesia dengan vibes Gen Z: santai, hangat, persuasif, tidak kaku.
Gunakan informasi halaman (jika ada) + petunjuk pengguna berikut:
${topicLine}${customLine}${pageInfo}

BATASAN:
- Tanpa markdown (tanpa **, *, #, -, 1., >).
- Tanpa bullet/list; paragraf mengalir.
- Emoji secukupnya (maks 2–3).
- Baris pertama adalah JUDUL singkat & catchy.
- Akhiri dengan CTA PERSIS: "Klik link ini 👉 ${linkProduk}"
- Hindari klaim berlebihan; fokus manfaat nyata.
- ${variationNote}

KONTEKS:
- Link produk: ${linkProduk}
- Gaya: ${gaya || "Gen Z natural & persuasif"}
- Target panjang: ${targetKata}

HASIL:
- Keluarkan TEKS biasa (bukan JSON/markdown): judul pada baris pertama, lalu 1–3 paragraf, akhiri CTA.
`.trim();

      const example = `
Contoh nuansa (jangan disalin mentah):
Upgrade Gaya Tanpa Ribet ✨
Buat kamu yang pengin tampil fresh setiap hari, ini pilihan yang pas. Fokusnya kenyamanan, tampilan clean, dan gampang dipadu-padankan. Rasakan bedanya pas dipakai.

Klik link ini 👉 ${linkProduk}
`.trim();

      const body = {
        contents: [
          { role: "user", parts: [{ text: rules }] },
          { role: "user", parts: [{ text: example }] }
        ],
        generationConfig: {
          temperature: 0.85 + Math.random() * 0.15, // sedikit variasi
          topK: 50,
          topP: 0.9,
          maxOutputTokens: 1024
        }
      };

      const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify(body)
      });

      const raw = await resp.text();
      if (!resp.ok) throw new Error(`Gemini error (${resp.status}): ${raw.slice(0, 600)}`);

      let data = null;
      try { data = JSON.parse(raw); } catch {}
      const text = extractText(data);
      if (!text) throw new Error(`No text from Gemini: ${raw.slice(0, 600)}`);

      // rapikan + enforce CTA
      const tidy = s => (s || "")
        .replace(/^\s*[-*•]\s+/gm, "")
        .replace(/[`*_~#>]+/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      let clean = tidy(text);
      const desiredCTA = `Klik link ini 👉 ${linkProduk}`;
      if (!clean.includes(desiredCTA)) {
        clean = clean.replace(/Klik link ini.+$/m, "").trim();
        clean = `${clean}\n\n${desiredCTA}`;
      }

      return clean;
    };

    // ---------- STEP 3: Generate N variasi (berurutan agar stabil kuota) ----------
    const results = [];
    for (let i = 1; i <= total; i++) {
      try {
        results.push(await generateOne(i));
      } catch (e) {
        results.push(`(Variasi ${i} gagal: ${String(e).slice(0, 300)})\n\nKlik link ini 👉 ${linkProduk}`);
      }
    }

    return res.status(200).json({
      version: VERSION,
      count: total,
      results,
      pageInfo,
      usedHints: { topicHint, customSummary }
    });

  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e), version: VERSION });
  }
}

// -------- helpers --------
function extractText(data) {
  const cands = data?.candidates || [];
  for (const c of cands) {
    const parts = c?.content?.parts;
    if (Array.isArray(parts)) {
      const t = parts.map(x => x?.text || "").join("\n").trim();
      if (t) return t;
    }
    const t2 = c?.content?.parts?.[0]?.text;
    if (t2 && t2.trim()) return t2.trim();
  }
  return "";
}

async function getPageInfo(url) {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await resp.text();

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const pMatch = html.match(/<p[^>]*>(.*?)<\/p>/i);

    const title = titleMatch ? titleMatch[1].trim() : "";
    const metaDesc = metaMatch ? metaMatch[1].trim() : "";
    const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : "";
    const pText = pMatch ? pMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    let info = "";
    if (title) info += `Judul halaman: ${title}\n`;
    if (metaDesc) info += `Deskripsi: ${metaDesc}\n`;
    if (!metaDesc && h1Text) info += `Heading utama: ${h1Text}\n`;
    if (!metaDesc && !h1Text && pText) info += `Paragraf awal: ${pText}\n`;

    if (!info) info = "(Tidak ada meta yang jelas; gunakan petunjuk pengguna & URL)";
    if (info.length > 700) info = info.slice(0, 700) + "...";
    return info;
  } catch {
    return "(Gagal mengambil isi halaman; gunakan petunjuk pengguna & URL)";
  }
}
