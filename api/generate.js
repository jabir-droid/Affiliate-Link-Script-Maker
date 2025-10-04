// api/generate.js
// v1-compliant, Gen Z tone, forced CTA, resilient parsing (tanpa safetySettings)

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const VERSION = "v1-genz-cta-r3";

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
    const { linkProduk, fotoUrl, gaya, panjang } = req.body || {};
    if (!linkProduk) return res.status(400).json({ error: "linkProduk wajib diisi", version: VERSION });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server belum diset GEMINI_API_KEY", version: VERSION });

    const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent`;

    // preferensi panjang
    const prefer = String(panjang || "").toLowerCase();
    const targetKata =
      prefer.includes("pendek") ? "≈ 50 kata" :
      prefer.includes("panjang") ? "≥ 300 kata" : "≈ 150 kata";

    // prompt (tanpa system_instruction, semua via user message)
    const rules = `
Tulis satu skrip promosi afiliasi berbahasa Indonesia dengan vibes Gen Z: santai, hangat, persuasif.
BATASAN:
- Tanpa markdown (tanpa **, *, #, -, 1., >).
- Tanpa bullet/list; gunakan paragraf mengalir.
- Emoji secukupnya (maks 2–3), jangan berlebihan.
- Baris pertama adalah judul singkat & catchy.
- Akhiri dengan CTA PERSIS: "Klik link ini 👉 ${linkProduk}"
- Hindari klaim berlebihan; fokus manfaat nyata & pengalaman pemakai.
KONTEKS:
- Link produk: ${linkProduk}
- Gaya bahasa: ${gaya || "Gen Z natural & persuasif"}
- Target panjang: ${targetKata}
- Info gambar: ${fotoUrl ? "ada, gunakan konteks seperlunya" : "tidak ada, abaikan"}
HASIL:
- Keluarkan teks biasa (bukan JSON/markdown): judul lalu 1–3 paragraf, akhiri CTA di atas.
`.trim();

    const example = `
Contoh nuansa (jangan disalin mentah):
Jangan Sampai Ketinggalan Trend! ✨
Lagi cari item yang bikin look kamu naik level tanpa ribet? Ini bisa jadi andalan. Kualitasnya oke, harga masuk akal, dan banyak yang sudah pakai. Cobain dulu biar kamu yang ngerasain bedanya.

Klik link ini 👉 ${linkProduk}
`.trim();

    const body = {
      contents: [
        { role: "user", parts: [{ text: rules }] },
        { role: "user", parts: [{ text: example }] }
      ],
      generationConfig: {
        temperature: 0.95,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 900
      }
    };

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

    // --- Robust extract ---
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    const candidates = data?.candidates || [];

    const extractText = (candArr) => {
      for (const c of candArr) {
        // 1) gabung semua parts[].text
        const parts = c?.content?.parts;
        if (Array.isArray(parts)) {
          const t = parts.map(x => x?.text || "").join("\n").trim();
          if (t) return t;
        }
        // 2) fallback satu part
        const t2 = c?.content?.parts?.[0]?.text;
        if (t2 && t2.trim()) return t2.trim();
      }
      return "";
    };

    let aiText = extractText(candidates);

    if (!aiText) {
      return res.status(502).json({
        error: "Gagal mengambil hasil dari Gemini",
        hint: "Tidak ada parts[].text di response; kirimkan responseSnippet ke pengembang.",
        responseSnippet: raw.slice(0, 1400),
        version: VERSION
      });
    }

    // --- Tidy + enforce CTA ---
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

    return res.status(200).json({ version: VERSION, result: clean });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e), version: VERSION });
  }
}
