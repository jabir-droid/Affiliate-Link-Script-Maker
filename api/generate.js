// /api/generate.js
// Vercel Serverless Function (Node)
// - Menerima BOTH schema lama & baru (back-compat)
// - Robust parsing (text -> JSON) untuk hindari "Unexpected end of JSON input"
// - Tampilkan detail error Gemini ke client agar mudah debug

const MODEL = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY; // Wajib di-set di Vercel Project Settings

function send(res, code, payload) { res.status(code).json(payload); }
function bad(res, code, message) { send(res, code, { ok: false, message }); }

function arrayify(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  return String(x).split(/[;,]\s*/g).map(s => s.trim()).filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return bad(res, 405, 'Method Not Allowed');
  }
  if (!API_KEY) return bad(res, 500, 'Server missing GEMINI_API_KEY');

  let body = {};
  try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}'); } catch { body = {}; }

  // Terima nama field baru & lama (back-compat)
  const linkProduk = (body.linkProduk || body.link || '').trim();
  const topik      = (body.topik || body.topic || '').trim();
  const gaya       = (body.gaya || body.style || 'Gen Z').trim();
  const panjang    = (body.panjang || body.length || 'Sedang').trim();
  const count      = Math.max(1, Math.min(5, Number(body.jumlah || body.generateCount || body.count || 3)));
  const deskripsi  = arrayify(body.deskripsi || body.descriptions);

  // Validasi
  if (!linkProduk) return bad(res, 400, 'INVALID_INPUT: linkProduk wajib diisi.');
  if (!topik)      return bad(res, 400, 'INVALID_INPUT: topik/poin utama wajib diisi.');
  if (deskripsi.length < 2) return bad(res, 400, 'INVALID_INPUT: minimal 2 deskripsi singkat.');

  // Prompt (tanpa system_instruction/responseSchema/safety_settings agar aman untuk v1)
  const system = [
    'Anda adalah penulis konten afiliasi berbahasa Indonesia.',
    'Tulis skrip promosi persuasif, natural, variatif (hindari bullet kaku).',
    'Selalu sertakan link produk pengguna.',
    `Gaya bahasa: ${gaya}`,
    `Target panjang: ${panjang}`,
    'Tambahkan CTA yang jelas, gunakan emoji 👉 sebelum link.'
  ].join('\n');

  const user = [
    `Buat ${count} variasi skrip afiliasi untuk: ${topik}`,
    `Link: ${linkProduk}`,
    `Deskripsi singkat: ${deskripsi.join(' | ')}`,
    '',
    'Balas dalam JSON VALID persis format:',
    `{"scripts":[{"title":"...","content":"..."}]}`,
    'JANGAN ada teks lain di luar JSON.'
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1/${MODEL}:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: system + '\n\n' + user }] }],
    generationConfig: { temperature: 0.9, topK: 40, topP: 0.95, maxOutputTokens: 1200 }
  };

  try {
    const fr = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });

    // Baca TEXT dulu supaya kalau body kosong/parsial kita tetap bisa kasih pesan jelas
    const raw = await fr.text();
    let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

    if (!fr.ok) {
      // Log ke Vercel Logs (optional):
      console.error('Gemini not ok', fr.status, raw);
      return send(res, fr.status, { ok: false, error: 'Gemini error', detail: data || raw || null });
    }
    if (!data) {
      return bad(res, 502, 'Gemini returned empty/invalid JSON body');
    }

    // Ambil konten kandidat → harusnya JSON string sesuai format yang diminta
    const text =
      data?.candidates?.[0]?.content?.parts?.find(p => typeof p?.text === 'string')?.text || '';

    let parsed;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

    if (!parsed || !Array.isArray(parsed.scripts) || parsed.scripts.length === 0) {
      // Fallback: kalau model tidak patuh JSON, bungkus teks mentah supaya UI tetap punya output
      const safeText = text && text.trim() ? text.trim() : 'Tidak ada keluaran.';
      parsed = { scripts: [{ title: 'Hasil', content: safeText }] };
    }

    return send(res, 200, { ok: true, model: MODEL, scripts: parsed.scripts, version: 'v1-accept-both+robust' });
  } catch (err) {
    return bad(res, 500, `Gagal mengambil hasil dari Gemini: ${String(err)}`);
  }
}
