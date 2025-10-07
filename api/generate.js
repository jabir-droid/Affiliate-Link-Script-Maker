// api/generate.js
const fetch = global.fetch;

function toClean(text = '') {
  return String(text || '').trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing (ENV)' });
    }

    const body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch (e) { reject(e); }
      });
    });

    const link = toClean(body.link);
    const mainPoint = toClean(body.mainPoint);
    const descriptions = Array.isArray(body.descriptions) ? body.descriptions.map(toClean).filter(Boolean) : [];
    const style = toClean(body.style || 'Gen Z');
    const length = toClean(body.length || 'Sedang');
    const variations = Math.max(1, Math.min(5, Number(body.variations || 3)));

    if (!link || !mainPoint || descriptions.length < 2) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        detail: 'Link, Poin utama, dan minimal 2 deskripsi wajib diisi.'
      });
    }

    const systemPrompt =
      `Kamu adalah creator copywriting berbahasa Indonesia. 
Buat ${variations} variasi skrip promosi afiliasi yang natural, tidak kaku, dan cocok untuk caption/media sosial.
JANGAN gunakan bullet * ataupun markdown tebal. Hindari list "1. 2. 3." di hasil akhir.
Tetap sertakan link yang diberikan (tulis apa adanya).
Gaya: ${style}. Panjang: ${length}.
Fokus pada poin utama dan deskripsi singkat yang diberikan pengguna.
`;

    const userPrompt =
      `Poin Utama Produk: ${mainPoint}
Deskripsi Singkat (referensi):
- ${descriptions.join('\n- ')}
Link Produk (WAJIB tampil di CTA akhir): ${link}

Format JSON jawab seperti ini:
{
  "scripts": [
    { "title": "Judul catchy", "content": "Isi copy yang natural, 3-6 kalimat, akhiri CTA dengan link 👉 ${link}" }
  ]
}`;

    // v1 endpoint
    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

    const payload = {
  contents: [{ parts: [{ text: userPrompt }] }],
  generationConfig: {
    temperature: 0.9,
    topK: 40,
    topP: 0.9,
    maxOutputTokens: 800
  }
};


    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: 'Gemini error', detail: t });
    }

    const json = await r.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      // Fallback: bikin 1 variasi manual jika JSON AI tidak valid
      data = {
        scripts: [{
          title: `Promo • ${mainPoint}`,
          content:
            `Cari ${mainPoint} yang pas? Ini dia jawabannya. ${descriptions.join(' ')}. ` +
            `Langsung cek detailnya ya. Klik link ini 👉 ${link}`
        }]
      };
    }

    return res.status(200).json({ ok: true, result: data, model, version: "v1-full" });
  } catch (e) {
    return res.status(500).json({ error: 'SERVER_ERROR', detail: String(e) });
  }
};
