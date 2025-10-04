// api/generate.js
// Generate skrip afiliasi: natural, tanpa bullet/markdown, judul catchy.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash"; 
// (opsional) set di Vercel: GEMINI_MODEL=gemini-2.5-pro untuk kualitas lebih halus

export default async function handler(req, res) {
  // CORS
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

    const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent`;

    // Preferensi user → konversi ringkas
    const preferPanjang = (panjang || "").toLowerCase();
    const targetKata =
      preferPanjang.includes("pendek") ? "≈ 50 kata" :
      preferPanjang.includes("panjang") ? "≥ 300 kata" : "≈ 150 kata";

    // System instruction (snake_case untuk v1)
    const systemInstruction = `
Anda adalah copywriter afiliasi berbahasa Indonesia.
Tulis naskah yang natural, cair, dan meyakinkan.
BATASAN FORMAT:
- Jangan gunakan markdown sama sekali (tanpa **, *, #, -, 1., dst).
- Jangan pakai bullet/list; gunakan paragraf mengalir.
- Beri 1 judul singkat, memikat.
- Tutup dengan CTA halus yang menyertakan link produk dari pengguna.
- Hindari klaim berlebihan atau janji tak realistis.
`.trim();

    // Few-shot (contoh gaya)
    const example = {
      title: "Jangan Sampai Ketinggalan Trend!",
      content: `Lagi cari sesuatu yang bikin tampilan kamu beda dan makin kece? Produk yang lagi ramai ini jawabannya.
Kualitasnya masuk akal, harganya bersahabat, dan sudah dipakai banyak orang. Cobain sendiri biar kamu yang menilai.
Kalau penasaran, cek detailnya di tautan ini ya: ${linkProduk}`
    };

    // Brief untuk sesi ini + instruksi output JSON
    const userBrief = `
Buat 1 skrip promosi afiliasi untuk link berikut:
- Link Produk: ${linkProduk}
- Gaya bahasa: ${gaya || "natural & persuasif"}
- Target panjang: ${targetKata}
- Info gambar: ${fotoUrl ? "pertimbangkan konteks foto yang diberikan" : "tidak ada foto, abaikan"}

Output HARUS berupa JSON valid dengan struktur berikut (tanpa markdown):
{
  "title": "Judul singkat dan memikat",
  "content": "Naskah 1–3 paragraf, tanpa bullet/markdown, akhiri dengan CTA yang menyertakan link produk."
}
Pastikan link produk PASTI muncul dalam "content".
`.trim();

    // Body request v1 (tanpa responseSchema/responseMimeType)
    const body = {
      system_instruction: { role: "system", parts: [{ text: systemInstruction }] },
      contents: [
        { role: "user",  parts: [{ text: "Contoh gaya yang diinginkan (jangan salin mentah):" }] },
        { role: "model", parts: [{ text: JSON.stringify(example) }] },
        { role: "user",  parts: [{ text: userBrief }] }
      ],
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 800
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

    const rawText = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "Gemini error", detail: rawText.slice(0, 1200) });
    }

    // Ambil teks JSON dari kandidat
    let data = null;
    try { data = JSON.parse(rawText); } catch {}
    const textJson = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON yang dihasilkan model
    let payload = null;
    try { payload = JSON.parse(textJson); } catch {}

    if (!payload?.title || !payload?.content) {
      return res.status(500).json({ error: "Format AI tidak sesuai", detail: textJson || rawText.slice(0, 1200) });
    }

    // Bersihkan sisa simbol markdown/bullet kalau ada
    const stripMd = s => (s || "")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/[`*_~#>]+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    let title = stripMd(payload.title);
    let content = stripMd(payload.content);

    // Pastikan link produk ada di content
    if (!content.includes(linkProduk)) {
      content = `${content}\n\nCek detailnya di tautan ini: ${linkProduk}`;
    }

    return res.status(200).json({ result: `${title}\n\n${content}` });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
