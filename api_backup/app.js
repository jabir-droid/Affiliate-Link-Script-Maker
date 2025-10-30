// api/app.js
const { Redis } = require("@upstash/redis");

// --- util JSON / body / cookie helpers ---
function j(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
async function readJson(req) {
  const bufs = [];
  for await (const c of req) bufs.push(c);
  const txt = Buffer.concat(bufs).toString("utf8");
  return txt ? JSON.parse(txt) : {};
}
function parseCookies(req) {
  const raw = req.headers?.cookie || "";
  return raw.split(/;\s*/).reduce((acc, p) => {
    const i = p.indexOf("=");
    if (i > -1) acc[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1));
    return acc;
  }, {});
}
function setCookie(res, name, val, { maxAge = 60 * 60 * 24 * 30, path = "/" } = {}) {
  const cookie = `${name}=${encodeURIComponent(val)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
  // If header already exists, append
  const prev = res.getHeader("Set-Cookie");
  if (prev) {
    if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, cookie]);
    else res.setHeader("Set-Cookie", [String(prev), cookie]);
  } else {
    res.setHeader("Set-Cookie", cookie);
  }
}
function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

// --- Redis client helper (optional) ---
function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
const redis = getRedis();

// --- auth / session helpers ---
const SESSION_COOKIE = "aff_session";
const ALLOW_SET = "aff:users";
async function getSessionName(req) {
  const c = parseCookies(req)[SESSION_COOKIE];
  return c ? String(c).trim().toLowerCase() : null;
}
async function requireLogin(req, res) {
  const name = await getSessionName(req);
  if (!name) {
    j(res, 401, { ok: false, message: "Belum login" });
    return null;
  }
  return name;
}

// --- misc helpers ---
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// single exported handler
module.exports = async (req, res) => {
  try {
    // Build URL object for routing
    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `http://${host}`);
    const p = url.pathname;

    // Health
    if (p === "/api/health" || p === "/api/ping") return j(res, 200, { ok: true, ts: Date.now(), method: req.method, ua: req.headers["user-agent"] || "" });

    /* ---- login with Lynk.id name ---- */
    if (p === "/api/login-name") {
      if (req.method !== "POST") return j(res, 405, { ok: false, message: "Method Not Allowed" });
      const body = await readJson(req);
      const raw = String(body.name || "").trim().toLowerCase();
      if (!raw) return j(res, 400, { ok: false, message: "Nama wajib diisi" });

      if (redis) {
        const allowed = await redis.sismember(ALLOW_SET, raw);
        if (!allowed) return j(res, 403, { ok: false, message: "Nama tidak terdaftar di Lynk.id" });
      }
      setCookie(res, SESSION_COOKIE, raw);
      return j(res, 200, { ok: true, name: raw });
    }

    /* ---- check status login ---- */
    if (p === "/api/me") {
      if (req.method !== "GET") return j(res, 405, { ok: false });
      const name = await getSessionName(req);
      return j(res, 200, { ok: !!name, name });
    }

    /* ---- logout ---- */
    if (p === "/api/logout") {
      if (req.method !== "POST") return j(res, 405, { ok: false });
      clearCookie(res, SESSION_COOKIE);
      return j(res, 200, { ok: true });
    }

    /* ---- admin allowlist (GET/POST/DELETE) ---- */
    if (p === "/api/admin/users") {
      const key = req.headers["x-admin-key"] || req.headers["x-admin-secret"] || req.headers["x-admin"];
      if (!key || key !== (process.env.ADMIN_SECRET || "")) return j(res, 401, { ok: false, message: "Unauthorized" });
      if (!redis) return j(res, 500, { ok: false, message: "Redis tidak dikonfigurasi" });

      if (req.method === "GET") {
        const all = await redis.smembers(ALLOW_SET);
        return j(res, 200, { ok: true, users: all || [] });
      }
      if (req.method === "POST") {
        const body = await readJson(req);
        const n = String(body.name || "").trim().toLowerCase();
        if (!n) return j(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.sadd(ALLOW_SET, n);
        return j(res, 200, { ok: true, added: n });
      }
      if (req.method === "DELETE") {
        const body = await readJson(req);
        const n = String(body.name || "").trim().toLowerCase();
        if (!n) return j(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.srem(ALLOW_SET, n);
        return j(res, 200, { ok: true, removed: n });
      }
      return j(res, 405, { ok: false, message: "Method Not Allowed" });
    }

    /* ---- usage (admin) ---- */
    if (p === "/api/usage") {
      const key = req.headers["x-admin-key"] || req.headers["x-admin-secret"] || req.headers["x-admin"];
      if (!key || key !== (process.env.ADMIN_SECRET || "")) return j(res, 401, { ok: false, message: "Unauthorized" });

      const QUOTA = Number(process.env.QUOTA_DAILY_LIMIT || 1000);
      const today = todayStr();
      try {
        if (!redis) {
          return j(res, 200, { ok: true, date: today, quota_daily: QUOTA, global_used: 0, per_user: [] });
        }
        const globalUsed = Number(await redis.get(`aff:global:used:${today}`)) || 0;

        const per_user = [];
        // scan keys matching aff:user:used:YYYYMMDD:*
        let cursor = 0;
        do {
          const r = await redis.scan(cursor, { match: `aff:user:used:${today}:*`, count: 100 });
          cursor = Number(r[0]);
          const keys = r[1] || [];
          if (keys.length) {
            const vals = await redis.mget(...keys);
            keys.forEach((k, idx) => {
              const name = k.split(":").pop();
              per_user.push({ name, used: Number(vals[idx] || 0) });
            });
          }
        } while (cursor !== 0);
        return j(res, 200, { ok: true, date: today, quota_daily: QUOTA, global_used: globalUsed, per_user });
      } catch (e) {
        return j(res, 500, { ok: false, message: String(e?.message || e) });
      }
    }

    /* ---- quota public ---- */
    if (p === "/api/quota") {
      try {
        let remaining = Number(process.env.QUOTA_DAILY_LIMIT || 1000);
        if (redis) {
          const used = Number(await redis.get(`aff:global:used:${todayStr()}`)) || 0;
          remaining = Math.max(0, remaining - used);
        }
        return j(res, 200, { ok: true, remaining });
      } catch {
        return j(res, 200, { ok: true, remaining: Number(process.env.QUOTA_DAILY_LIMIT || 1000) });
      }
    }

    /* ---- generate ---- */
    if (p === "/api/generate") {
      if (req.method !== "POST") return j(res, 405, { ok: false, message: "Method Not Allowed" });

      const user = await getSessionName(req);
      if (!user) return j(res, 401, { ok: false, message: "Belum login" });

      const b = await readJson(req);
      const linkProduk = String(b.linkProduk || b.link || "").trim();
      const topik = String(b.topik || b.topic || b.nama || "").trim();
      const deskripsi = Array.isArray(b.deskripsi) ? b.deskripsi : typeof b.deskripsi === "string" && b.deskripsi ? b.deskripsi.split(/\n|,/) : [];
      const gaya = String(b.gaya || "Santai & Ramah");
      const panjang = String(b.panjang || "Sedang (2-3 paragraf)");
      const jumlah = Math.max(1, Math.min(8, Number(b.jumlah || b.count || 1)));

      if (!linkProduk) return j(res, 400, { ok: false, message: "linkProduk wajib diisi." });
      if (!topik) return j(res, 400, { ok: false, message: "Nama/Jenis Produk wajib diisi." });
      if (!deskripsi || deskripsi.length < 1) return j(res, 400, { ok: false, message: "Minimal 1 kelebihan/keunggulan." });

      const prompt = `
Tulis ${jumlah} variasi skrip promosi afiliasi dalam bahasa Indonesia.
Produk: ${topik}
Kelebihan: ${deskripsi.join(", ")}
Link: ${linkProduk}
Gaya: ${gaya}
Panjang: ${panjang}

Format keluaran HARUS JSON valid TANPA teks lain:
{ "scripts": [ { "title": "Judul Variasi 1", "content": "Isi (boleh multi-paragraf)" } ] }
`.trim();

      let scripts;
      try {
        if (!GEMINI_API_KEY) {
          // fallback dev (local sample content)
          scripts = Array.from({ length: jumlah }).map((_, i) => ({
            title: `${topik} - Variasi ${i + 1}`,
            content: `✨ ${topik} — Variasi ${i + 1}\n${deskripsi.join(" • ")}\n\n${linkProduk} 👉`
          }));
        } else {
          // call Gemini (Generative Language API)
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;
          const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, topP: 0.9 } };
          const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const textRaw = await r.text();
          if (!r.ok) throw new Error(textRaw);
          const j = JSON.parse(textRaw);
          const text = (j?.candidates?.[0]?.content?.parts?.map(p => p?.text).join("") || j?.candidates?.[0]?.content?.parts?.[0]?.text || "");
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = JSON.parse(String(text).replace(/```json|```/g, "").trim());
          }
          if (!Array.isArray(parsed?.scripts)) throw new Error("Format balikan model tidak sesuai (tanpa 'scripts').");
          scripts = parsed.scripts;
        }
      } catch (e) {
        return j(res, 502, { ok: false, message: `Gemini error: ${String(e?.message || e)}` });
      }

      // record usage
      try {
        if (redis) {
          await redis.incr(`aff:global:used:${todayStr()}`);
          await redis.incr(`aff:user:used:${todayStr()}:${user}`);
        }
      } catch {}

      return j(res, 200, { ok: true, scripts });
    }

    // default 404
    return j(res, 404, { ok: false, message: "Not Found" });
  } catch (e) {
    return j(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
