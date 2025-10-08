// /api/generate.js
import { Redis } from '@upstash/redis';

const MODEL = process.env.GEMINI_MODEL || "models/gemini-2.5-flash-lite";
const API_KEY = process.env.GEMINI_API_KEY;

function connectRedis() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
function todayKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `quota:${y}-${m}-${dd}`;
}
const DAILY_LIMIT =
  Number(process.env.QUOTA_DAILY_LIMIT || process.env.MAX_GLOBAL_PER_DAY || 1000);

async function incrementUsage(redis) {
  if (!redis) return;
  const key = todayKey();
  const val = await redis.incr(key);
  // TTL sampai akhir hari UTC
  if (val === 1) {
    const now = Math.floor(Date.now() / 1000);
    const end = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()+1, 0,0,0) / 1000);
    await redis.expire(key, Math.max(60, end - now));
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, message:'Method not allowed' });

    // Normalisasi input
    const body = req.body || {};
    const linkProduk = body.linkProduk || body.link;
    const topik = body.topik || body.topic;
    const deskripsi = body.deskripsi || body.descriptions || [];
    const gaya = body.gaya || body.style || 'Gen Z';
    const panjang = body.panjang || body.length || 'Sedang';
    const jumlah = Math.max(1, Math.min(5, Number(body.jumlah || body.generateCount || body.count || 2)));

    if (!linkProduk) return res.status(400).json({ ok:false, message:'INVALID_INPUT: linkProduk wajib diisi.' });
    if (!topik) return res.status(400).json({ ok:false, message:'INVALID_INPUT: topik wajib diisi.' });
    if (!Array.isArray(deskripsi) || deskripsi.filter(Boolean).length < 2)
      return res.status(400).json({ ok:false, message:'INVALID_INPUT: deskripsi minimal 2 item.' });
    if (!API_KEY) return res.status(500).json({ ok:false, message:'Server belum dikonfigurasi GEMINI_API_KEY' });

    // Kuota check
    const redis = connectRedis();
    if (redis) {
      const used = Number(await redis.get(todayKey())) || 0;
      if (used >= DAILY_LIMIT) {
        return res.status(429).json({ ok:false, message:'Kuota hari ini sudah habis.' });
      }
    }

    // Prompt
    const systemPrompt =
      "Anda adalah copywriter afiliasi berbahasa Indonesia. Tulis skrip promosi natural, non-markdown, tanpa bullet (*) kecuali benar-benar perlu. Wajib sisipkan tautan produk yang diberikan apa adanya.";

    const userPrompt =
`Buat ${jumlah} variasi skrip afiliasi.
- Link Produk: ${linkProduk}
- Poin Utama Produk: ${topik}
- Gaya Bahasa: ${gaya}
- Panjang: ${panjang}
- Poin keunggulan (ringkas): ${deskripsi.map((d,i)=>`${i+1}. ${d}`).join(' ')}
Keluaran HARUS JSON:
{
  "scripts": [
    {"title": "string", "content": "string (paragraph, non-markdown, sertakan CTA: 'Klik link ini 👉 ${linkProduk}')"}
  ]
}`;

    // Panggil Gemini (v1)
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${API_KEY}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        contents:[{ role:"user", parts:[{text: userPrompt}] }],
        // Tanpa safety_settings (menghindari error kategori lama)
        generationConfig:{
          temperature:0.9,
          maxOutputTokens:1024
        }
      })
    });

    const raw = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ ok:false, message:`Gemini error (${resp.status}): ${raw}` });
    }

    // Ambil teks dari candidates
    let text = '';
    try {
      const j = JSON.parse(raw);
      text = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {}
    if (!text) {
      return res.status(502).json({ ok:false, message:'Gagal mengambil hasil dari Gemini' });
    }

    // Parse JSON yang dikembalikan model
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      // fallback: coba cari blok JSON di dalam teks
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const scripts = Array.isArray(parsed?.scripts) ? parsed.scripts.slice(0, jumlah) : [];

    if (!scripts.length) {
      return res.status(502).json({ ok:false, message:'Format hasil Gemini tidak sesuai.' });
    }

    // increment kuota setelah sukses
    if (redis) await incrementUsage(redis);

    return res.status(200).json({ ok:true, model: MODEL, scripts });
  } catch (e) {
    return res.status(500).json({ ok:false, message:String(e.message || e) });
  }
}
