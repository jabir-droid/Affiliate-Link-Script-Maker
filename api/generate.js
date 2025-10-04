// api/generate.js
// Generate skrip afiliasi berkualitas: natural, tanpa bullet/markdown, dengan judul catchy.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash"; 
// ↑ kalau mau kualitas maksimal, set ENV: GEMINI_MODEL=gemini-2.5-pro

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

    // ——— Normalisasi preferensi gaya/panjang
    const preferGaya = (gaya || "").toLowerCase();
    const preferPanjang = (panjang || "").toLowerCase();
    const targetKata =
      preferPanjang.includes("pendek") ? "≈ 50 kata" :
      preferPanjang.includes("sedang") ? "≈ 150 kata" :
      preferPanjang.includes("panjang") ? "≥ 300 kata" : "≈ 150 kata";

    // ——— System instruction: larang bullet/markdown, minta bahasa natural
    const systemInstruction = `
Anda adalah copywriter afiliasi berbahasa Indonesia yang menulis dengan gaya natural, cair, dan meyakinkan.
Tujuan: membuat skrip promosi yang enak dibaca, terdengar manusiawi, dan mendorong klik.
BATASAN FORMAT PENTING:
- Jangan gunakan markdown sama sekali (tanpa **bold**, *italic*, \`code\`, heading, atau garis "---").
- Jangan gunakan bullet atau list (tanpa tanda *, -, 1., 2., dst).
- Tulis dalam paragraf-paragraf mengalir, dengan 1 judul yang singkat dan memikat.
- Sertakan CTA yang mulus di akhir, menyertakan link produk yang diberikan.
- Jaga diksi tetap sopan, tidak berlebihan/overhype, dan tidak menyinggung.
`.trim();

    // ——— Few-shot example (memberi contoh gaya yang diinginkan)
    const exampleTitle = "Jangan Sampai Ketinggalan Trend!";
    const exampleContent = `
Lagi cari sesuatu yang bikin tampilan kamu beda dan makin kece? Produk yang lagi ramai ini jawabannya.
Kualitasnya masuk akal, harganya bersahabat, dan sudah dipakai banyak orang. Cobain sendiri rasanya—biar kamu yang menilai. 
Kalau penasaran, cek detailnya di tautan ini ya: ${linkProduk}
`.trim();

    // ——— Prompt pengguna yang spesifik untuk sesi ini
    const userBrief = `
Buat 1 skrip promosi afiliasi untuk link berikut:
- Link Produk: ${linkProduk}
- Gaya bahasa yang diminta: ${gaya || "natural & persuasif"}
- Target panjang: ${targetKata}
- Jika ada informasi dari gambar: ${fotoUrl ? "pertimbangkan konteks foto yang diberikan" : "tidak ada foto, abaikan"}
Fokus pada manfaat nyata dan pengalaman pengguna; hindari klaim berlebihan.
Hasil harus terdiri dari:
1) "title": judul singkat dan memikat (tanpa tanda kutip).
2) "content": naskah promosi 1–3 paragraf, tanpa bullet/markdown, dengan CTA halus yang menyertakan link produk tersebut.
`.trim();

    // ——— Body ke Gemini: schema JSON agar output rapi
    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [
        // Few-shot (contoh)
        {
          role: "user",
          parts: [{ text: "Contoh gaya yang diinginkan (jangan salin mentah):" }]
        },
        {
          role: "model",
          parts: [{
            text: JSON.stringify({
              title: exampleTitle,
              content: exampleContent
            })
          }]
        },
        // Brief pengguna
        {
          role: "user",
          parts: [{ text: userBrief }]
        }
      ],
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.9,
        maxOutputTokens: 800,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            content: { type: "STRING" }
          },
          required: ["title", "content"]
        }
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

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "Gemini error", detail: text.slice(0, 1200) });
    }

    // Parsing aman
    let data = null;
    try { data = JSON.parse(text); } catch { /* noop */ }

    // Ambil JSON dari parts
    let payload = null;
    try {
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      payload = JSON.parse(raw);
    } catch { /* noop */ }

    if (!payload?.title || !payload?.content) {
      return res.status(500).json({ error: "Format AI tidak sesuai", detail: text.slice(0, 1200) });
    }

    // ——— Post-processing ringan: bersihkan kemungkinan sisa simbol
    const stripMd = s => (s || "")
      .replace(/^\s*[-*•]\s+/gm, "")       // bullet standar
      .replace(/[`*_~#>]+/g, "")          // simbol markdown umum
      .replace(/\n{3,}/g, "\n\n")         // normalisasi newline
      .trim();

    const clean = {
      title: stripMd(payload.title),
      content: stripMd(payload.content)
    };

    // Pastikan link produk tercantum (jaga2 kalau model lupa)
    if (!clean.content.includes(linkProduk)) {
      clean.content = `${clean.content}\n\nCek detailnya di tautan berikut: ${linkProduk}`;
    }

    return res.status(200).json({
      result: `${clean.title}\n\n${clean.content}`
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
