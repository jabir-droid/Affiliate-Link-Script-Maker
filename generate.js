// api/generate.js
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // bisa set ke gemini-2.5-pro di ENV
const VERSION = "genz-v3-nosi"; // penanda versi deploy

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

    const prefer = String(panjang || "").toLowerCase();
    const targetKata =
      prefer.includes("pendek") ? "≈ 50 kata" :
      prefer.includes("panjang") ? "≥ 300 kata" : "≈ 150 kata";

    // Semua aturan dimasukkan sebagai "user" message—TANPA system_instruction
    const rulesGenZ = `
Tulis skrip promosi afiliasi berbahasa Indonesia dengan vibes Gen Z: santai, hangat, persuasif.
BATASAN:
- Tanpa markdown (tidak ada **, *, #, -, 1., >).
- Tanpa bullet/list; gunakan paragraf mengalir.
- Gunakan emoji secukupnya (maks 2–3).
- Buat 1 judul singkat & catchy.
- Tutup dengan CTA persis: "Klik link ini 👉 ${linkProduk}"
- Hindari klaim berlebihan; fokus manfaat nyata & pengalaman pengguna.
`.trim();

    const example = {
      title: "Jangan Sampai Ketinggalan Trend! ✨",
      content: `Lagi cari item yang bikin look kamu upgrade tanpa ribet? Ini jawabannya. Kualitasnya oke, harga masuk akal, dan banyak yang sudah pakai. Cobain sendiri biar kamu yang ngerasain bedanya.

Siap upgrade? Klik link ini 👉 ${linkProduk}`
    };

    const userBrief = `
Buat 1 skrip untuk link berikut:
- Link Produk: ${linkProduk}
- Gaya bahasa: ${gaya || "Gen Z natural & persuasif"}
- Target panjang: ${targetKata}
- Info gambar: ${fotoUrl ? "ada, gunakan konteks seperlunya" : "tidak ada, abaikan"}

KELUARAN WAJIB berupa JSON VALID (bukan markdown) dengan format:
{
  "title": "Judul singkat & catchy",
  "content": "Naskah 1–3 paragraf, TANPA bullet/markdown. Akhiri dengan CTA persis: 'Klik link ini 👉 ${linkProduk}'"
}
Pastikan link produk TERCANTUM dalam "content".
`.trim();

    const body = {
      contents: [
        { role: "user", parts: [{ text: rulesGenZ }] },
        { role: "user", parts: [{ text: "Contoh gaya (jangan disalin mentah):" }] },
        { role: "model", parts: [{ text: JSON.stringify(example) }] },
        { role: "user", parts: [{ text: userBrief }] }
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
      return res.status(resp.status).json({ error: "Gemini error", detail: raw.slice(0, 1200), version: VERSION });
    }

    let data = null;
    try { data = JSON.parse(raw); } catch {}
    const textJson = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let payload = null;
    try { payload = JSON.parse(textJson); } catch {}

    if (!payload?.title || !payload?.content) {
      return res.status(500).json({ error: "Format AI tidak sesuai", detail: textJson || raw.slice(0, 1200), version: VERSION });
    }

    const tidy = s => (s || "")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/[`*_~#>]+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    let title = tidy(payload.title);
    let content = tidy(payload.content);

    const desiredCTA = `Klik link ini 👉 ${linkProduk}`;
    if (!content.includes(desiredCTA)) {
      content = content.replace(/Klik link ini.+$/m, "").trim();
      content = `${content}\n\n${desiredCTA}`;
    }

    return res.status(200).json({ version: VERSION, result: `${title}\n\n${content}` });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e), version: VERSION });
  }
}
