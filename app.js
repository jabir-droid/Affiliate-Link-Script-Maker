// api/app.js  (CommonJS – no ESM)
const { Redis } = require("@upstash/redis");

/* =============== util JSON & cookie =============== */
function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}
function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(/;\s*/).reduce((acc, p) => {
    const i = p.indexOf("=");
    if (i > -1) acc[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    return acc;
  }, {});
}
function setCookie(res, name, val, { maxAge = 60 * 60 * 24 * 30, path = "/" } = {}) {
  const cookie = `${name}=${encodeURIComponent(val)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
  res.setHeader("Set-Cookie", cookie);
}
function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

/* =============== Redis client =============== */
function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
const redis = redisClient();

/* =============== Helpers bisnis =============== */
const SESSION_COOKIE = "aff_session";           // simpan nama lynk.id yg sudah login
const ALLOW_SET = "aff:users";                  // allowlist (lowercase)

async function getSessionName(req) {
  const c = parseCookies(req)[SESSION_COOKIE];
  return c ? String(c).trim().toLowerCase() : null;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/* =============== Gemini config =============== */
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/* =============== Router tunggal =============== */
module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    /* ---- health ---- */
    if (p === "/api/health") return json(res, 200, { ok: true });

    /* ---- login dengan nama Lynk.id ---- */
    if (p === "/api/login-name") {
      if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method Not Allowed" });
      const body = JSON.parse((await readBody(req)) || "{}");
      const raw = String(body.name || "").trim().toLowerCase();
      if (!raw) return json(res, 400, { ok: false, message: "Nama wajib diisi" });

      if (redis) {
        const allowed = await redis.sismember(ALLOW_SET, raw);
        if (!allowed) return json(res, 403, { ok: false, message: "Nama tidak terdaftar di Lynk.id" });
      }
      setCookie(res, SESSION_COOKIE, raw);
      return json(res, 200, { ok: true, name: raw });
    }

    /* ---- cek status login ---- */
    if (p === "/api/me") {
      if (req.method !== "GET") return json(res, 405, { ok: false });
      const name = await getSessionName(req);
      return json(res, 200, { ok: !!name, name });
    }

    /* ---- logout ---- */
    if (p === "/api/logout") {
      if (req.method !== "POST") return json(res, 405, { ok: false });
      clearCookie(res, SESSION_COOKIE);
      return json(res, 200, { ok: true });
    }

    /* ---- admin allowlist (GET/POST/DELETE) ---- */
    if (p === "/api/admin/users") {
      const key = req.headers["x-admin-key"];
      if (!key || key !== process.env.ADMIN_SECRET) return json(res, 401, { ok: false, message: "Unauthorized" });
      if (!redis) return json(res, 500, { ok: false, message: "Redis tidak dikonfigurasi" });

      if (req.method === "GET") {
        const all = await redis.smembers(ALLOW_SET);
        return json(res, 200, { ok: true, users: all || [] });
      }
      if (req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const n = String(body.name || "").trim().toLowerCase();
        if (!n) return json(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.sadd(ALLOW_SET, n);
        return json(res, 200, { ok: true, added: n });
      }
      if (req.method === "DELETE") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const n = String(body.name || "").trim().toLowerCase();
        if (!n) return json(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.srem(ALLOW_SET, n);
        return json(res, 200, { ok: true, removed: n });
      }
      return json(res, 405, { ok: false, message: "Method Not Allowed" });
    }

    /* ---- kuota sederhana ---- */
    if (p === "/api/quota") {
      try {
        let remaining = 1000;
        if (redis) {
          const used = Number(await redis.get(`aff:global:used:${todayStr()}`)) || 0;
          remaining = Math.max(0, 1000 - used);
        }
        return json(res, 200, { ok: true, remaining });
      } catch {
        return json(res, 200, { ok: true, remaining: 1000 });
      }
    }

    /* ---- generate ---- */
    if (p === "/api/generate") {
      if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method Not Allowed" });

      const user = await getSessionName(req);
      if (!user) return json(res, 401, { ok: false, message: "Belum login" });

      const b = JSON.parse((await readBody(req)) || "{}");
      const linkProduk = String(b.linkProduk || b.link || "").trim();
      const topik = String(b.topik || b.topic || "").trim();
      const deskripsi = Array.isArray(b.deskripsi)
        ? b.deskripsi
        : Array.isArray(b.descriptions)
        ? b.descriptions
        : [];
      const gaya = String(b.gaya || b.style || "Santai & Ramah");
      const panjang = String(b.panjang || b.length || "Sedang (2-3 paragraf)");
      const jumlah = Math.max(1, Math.min(8, Number(b.jumlah || b.count || 1)));

      if (!linkProduk) return json(res, 400, { ok: false, message: "linkProduk wajib diisi." });
      if (!topik) return json(res, 400, { ok: false, message: "Nama/Jenis Produk wajib diisi." });
      if ((deskripsi || []).length < 1) return json(res, 400, { ok: false, message: "Minimal 1 kelebihan/keunggulan." });

      const prompt = `
Tulis ${jumlah} variasi skrip promosi afiliasi dalam bahasa Indonesia.
Produk: ${topik}
Kelebihan: ${deskripsi.join(", ")}
Link: ${linkProduk}
Gaya: ${gaya}
Panjang: ${panjang}

Format keluaran HARUS JSON valid TANPA teks lain:
{
  "scripts": [
    { "title": "Judul Variasi 1", "content": "Isi (boleh multi-paragraf)" }
  ]
}`.trim();

      let scripts;
      try {
        if (!GEMINI_API_KEY) {
          // fallback dev
          scripts = Array.from({ length: jumlah }).map((_, i) => ({
            title: `${topik}`,
            content: `✨ Variasi ${i + 1}\n${deskripsi.join(" • ")}\n\n${linkProduk}`,
          }));
        } else {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            GEMINI_MODEL
          )}:generateContent?key=${GEMINI_API_KEY}`;
          const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.9, topP: 0.9 }
          };
          const r = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const textRaw = await r.text();
          if (!r.ok) throw new Error(textRaw);
          const j = JSON.parse(textRaw);
          const text =
            (j && j.candidates && j.candidates[0] && j.candidates[0].content &&
              j.candidates[0].content.parts && j.candidates[0].content.parts.map(p => p.text).join("")) ||
            (j && j.candidates && j.candidates[0] && j.candidates[0].content &&
              j.candidates[0].content.parts && j.candidates[0].content.parts[0] &&
              j.candidates[0].content.parts[0].text) ||
            "";
          let parsed;
          try { parsed = JSON.parse(text); }
          catch { parsed = JSON.parse(String(text).replace(/```json|```/g, "").trim()); }
          if (!Array.isArray(parsed?.scripts)) throw new Error("Format balikan model tidak sesuai (tanpa 'scripts').");
          scripts = parsed.scripts;
        }
      } catch (e) {
        return json(res, 502, { ok: false, message: `Gemini error: ${String(e?.message || e)}` });
      }

      try {
        if (redis) {
          await redis.incr(`aff:global:used:${todayStr()}`);
          await redis.incr(`aff:user:used:${todayStr()}:${user}`);
        }
      } catch {}

      return json(res, 200, { ok: true, scripts });
    }

    /* ---- fallback 404 ---- */
    return json(res, 404, { ok: false, message: "Not Found" });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
