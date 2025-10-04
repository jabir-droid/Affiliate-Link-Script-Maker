// api/generate.js
// v1-compliant, Gen Z tone, forced CTA, resilient parsing
// r7: fetch page info (title, meta description, fallback h1/p)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash"; 
const VERSION = "v1-genz-cta-r7-fetch-fallback";

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
    const { linkProduk, gaya, panjang } = req.body || {};
    if (!linkProduk) return res.status(400).json({ error: "linkProduk wajib diisi", version: VERSION });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server belum diset GEMINI_API_KEY", version: VERSION });

    // --- STEP 1: Fetch konten halaman produk (title + meta + fallback)
    let pageInfo = "";
    try {
      const pageResp = await fetch(linkProduk, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await pageResp.text();

      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
      const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
      const pMatch = html.match(/<p[^>]*>(.*?)<\/p>/i);

      const title = titleMatch ? titleMatch[1].trim() : "";
      const metaDesc = metaMatch ? metaMatch[1].trim() : "";
      const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : "";
      const pText = pMatch ? pMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      if (title) pageInfo += `Judul halaman: ${title}\n`;
      if (metaDesc) pageInfo += `Deskripsi: ${metaDesc}\n`;
      if (!metaDesc && h1Text) pageInfo += `Heading utama: ${h1Text}\n`;
      if (!metaDesc && !h1Text && pText) pageInfo += `Paragraf awal: ${pText}\n`;

      if (pageInfo.length > 600) pageInfo = pageInfo.slice(0, 600) + "...";
    } catch (err) {
      pageInfo = "(Gagal mengambil isi halaman, gunakan tebakan dari URL saja)";
    }

    // --- STEP 2: Prompt untuk Gemini
    const prefer = String(panjang || "").toLowerCase();
    const targetKata =
      prefer.includes("pendek") ? "≈ 50 kata" :
      prefer.includes("panjang") ? "≥ 300 kata" : "≈ 150 kata";

    const rules = `
Tulis satu skrip promosi afiliasi berbahasa Indonesia dengan vibes Gen Z: santai, hangat, persuasif.
Gunakan informasi halaman produk (jika ada):
${pageInfo}

BATASAN:
- Tanpa markdown (tanpa **, *, #, -, 1., >).
- Tanpa bullet/list; gunakan paragraf mengalir.
- Emoji secukupnya (maks 2–3).
- Baris pertama adalah judul singkat & catchy.
- Akhiri dengan CTA PERSIS: "Klik link ini 👉 ${linkProduk}"
- Hindari klaim berlebihan; fokus manfaat nyata.
KONTEKS:
- Link produk: ${linkProduk}
- Gaya bahasa: ${gaya || "Gen Z natural & persuasif"}
- Target panjang: ${targetKata}
HASIL:
- Keluarkan teks biasa (judul lalu 1–3 paragraf, akhiri CTA).
`.trim();

    const example = `
Contoh nuansa (jangan disalin mentah):
Bikin Hidup Makin Simple ✨
Sejak pakai produk ini, banyak aktivitas jadi lebih gampang. Kualitas oke, desain kece, cocok buat anak muda aktif. Gak perlu repot, langsung bawa perubahan positif.

Klik link ini 👉 ${linkProduk}
`.trim();

    const body = {
      contents: [
        { role: "user", parts: [{ text: rules }] },
        { role: "user", parts: [{ text: example }] }
      ],
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 1024
      }
    };

    // --- STEP 3: Panggil Gemini API
    const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "Gemini error", detail: raw.slice(0, 1400), version: VERSION });
    }

    // --- STEP 4: Extract hasil
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    const candidates = data?.candidates || [];

    const extractText = (candArr) => {
      for (const c of candArr) {
        const parts = c?.content?.parts;
        if (Array.isArray(parts)) {
          const t = parts.map(x => x?.text || "").join("\n").trim();
          if (t) return t;
        }
        const t2 = c?.content?.parts?.[0]?.text;
        if (t2 && t2.trim()) return t2.trim();
      }
      return "";
    };

    let aiText = extractText(candidates);
    if (!aiText) {
      return res.status(502).json({
        error: "Gagal mengambil hasil dari Gemini",
        responseSnippet: raw.slice(0, 1400),
        version: VERSION
      });
    }

    // --- STEP 5: Rapikan & enforce CTA
    const tidy = s => (s || "")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/[`*_~#>]+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    let clean = tidy(aiText);
    const desiredCTA = `Klik link ini 👉 ${linkProduk}`;
    if (!clean.includes(desiredCTA)) {
      clean = clean.replace(/Klik link ini.+$/m, "").trim();
      clean = `${clean}\n\n${desiredCTA}`;
    }

    return res.status(200).json({ version: VERSION, result: clean, pageInfo });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e), version: VERSION });
  }
}
