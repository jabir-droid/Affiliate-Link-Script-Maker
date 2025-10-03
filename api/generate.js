// api/generate.js
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { linkProduk, fotoUrl, gaya, panjang } = req.body || {};
    if (!linkProduk) return res.status(400).json({ error: 'linkProduk wajib diisi' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server belum diset GEMINI_API_KEY' });

    const model = 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `
Tugasmu: tulis skrip promosi affiliate yang persuasif dan jelas.
Link produk: ${linkProduk}
Foto: ${fotoUrl || '-'}
Gaya: ${gaya || '-'} | Panjang: ${panjang || '-'}
Format: 1 paragraf pembuka, 3 bullet keunggulan, CTA kuat + link.
Gunakan bahasa Indonesia yang natural.
`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(500).json({ error: 'Gemini error', detail: t });
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') ||
      'Gagal mengambil hasil dari Gemini.';

    return res.status(200).json({ result: text });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
// serverless function 
