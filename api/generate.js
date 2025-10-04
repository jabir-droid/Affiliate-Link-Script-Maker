// api/generate.js
// Output: judul catchy + naskah Gen Z (tanpa bullet/markdown) + CTA "Klik link ini 👉 <link>"

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // bisa set ke gemini-2.5-pro di ENV
const VERSION = "v1-genz-cta";

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

    // Preferensi panjang → target kata sederhana
    const prefer = String(panjang || "").toLowerCase();
    const targetKata =
      prefer.includes("pendek") ? "≈ 50 kata" :
      prefer.includes("panjang") ? "≥ 300 kata" : "≈ 150 kata";

    // ——— Prompt aturan + contoh (semua via user message; v1 tidak punya system field)
    const rules = `
Tulis satu skrip promosi afiliasi berbahasa Indonesia dengan vibes Gen Z: santai, hangat, persuasif, tidak kaku.
BATASAN FORMAT:
- Dilarang markdown (tanpa **, *, #, -, 1., >, dll).
- Dilarang bullet/list; gunakan paragraf mengalir.
- Gunakan emoji secukupnya (maks 2–3) untuk nuansa akrab, jangan berlebihan.
- Beri 1 judul singkat & catchy di baris pertama.
- Tutup dengan CTA PERSIS: "Klik link ini 👉 ${linkProduk}"
- Hindari klaim berlebihan; fokus manfaat nyata & pengalaman pemakai.
KONTEKS:
- Link produk: ${linkProduk}
- Gaya bahasa diminta: ${gaya || "Gen Z natural & persuasif"}
- Target panjang: ${targetKata}
- Info gambar: ${fotoUrl ? "ada, gunakan konteks seperlunya" : "tidak ada, abaikan"}
HASIL:
- Keluarkan teks biasa (bukan JSON/markdown), berupa judul diikuti 1–3 paragraf konten, akhiri CTA persis di atas.
`.trim();

    // (Opsional) contoh nuansa sebagai inspirasi
    const example = `
Contoh nuansa (jangan disalin mentah):
Jangan Sampai Ketinggalan Trend! ✨
Lagi cari item yang bikin look kamu naik level tanpa ribet? Ini bisa jadi andalan. Kualitasnya oke, harganya masuk akal, dan sudah banyak yang pakai. Cobain biar kamu yang ngerasain bedanya. 
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
      return res.status(resp.status).json({ error: "Gemini error", detail: raw.slice(0, 1200), version: VERSION });
    }

    // Ambil teks dari kandidat
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const aiText = parts.map(p => p.text || "").join("\n").trim();

    if (!aiText) {
      return res.status(500).json({ error: "Gagal mengambil hasil dari Gemini", version: VERSION });
    }

    // ——— Bersihkan sisa simbol/bullet kalau masih lolos
    const tidy = s => (s || "")
      .replace(/^\s*[-*•]\s+/gm, "")  // hapus bullet
      .replace(/[`*_~#>]+/g, "")      // hapus simbol markdown umum
      .replace(/\n{3,}/g, "\n\n")     // normalisasi spasi/break
      .trim();

    let clean = tidy(aiText);

    // ——— Pastikan CTA persis ada di akhir
    const desiredCTA = `Klik link ini 👉 ${linkProduk}`;
    if (!clean.includes(desiredCTA)) {
      // hapus varian CTA lain jika ada
      clean = clean.replace(/Klik link ini.+$/m, "").trim();
      clean = `${clean}\n\n${desiredCTA}`;
    }

    return res.status(200).json({ version: VERSION, result: clean });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e), version: VERSION });
  }
}
