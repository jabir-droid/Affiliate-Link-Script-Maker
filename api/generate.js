// api/generate.js

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { linkProduk, fotoUrl, gaya, panjang } = req.body || {};
    if (!linkProduk) return res.status(400).json({ error: "linkProduk wajib diisi" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server belum diset GEMINI_API_KEY" });

    const model = "gemini-2.5-flash"; // pilih dari /api/models
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;

    const prompt = `
Tugasmu: tulis skrip promosi affiliate yang persuasif, jelas, dan natural.
Link produk: ${linkProduk}
Foto: ${fotoUrl || "-"}
Gaya: ${gaya || "-"} | Panjang: ${panjang || "-"}
Format:
1. Paragraf pembuka singkat.
2. 3 bullet keunggulan produk.
3. CTA + link produk.
Bahasa: Indonesia yang ramah & mengajak.
`.trim();

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const bodyText = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "Gemini error", detail: bodyText.slice(0, 1000) });
    }

    let data = null;
    try { data = JSON.parse(bodyText); } catch {}
    const result = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "Gagal mengambil hasil dari Gemini.";

    return res.status(200).json({ result });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
