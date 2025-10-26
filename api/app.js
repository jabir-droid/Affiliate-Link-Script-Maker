// api/app.js
// CommonJS single entry for Vercel Node runtime
const { Redis } = (() => {
  try { return require("@upstash/redis"); } catch { return {}; }
})();

function j(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  const bufs = [];
  for await (const c of req) bufs.push(c);
  const txt = Buffer.concat(bufs).toString("utf8");
  return txt ? JSON.parse(txt) : {};
}
function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(/;\s*/).reduce((acc, p) => {
    const i = p.indexOf("=");
    if (i > -1) acc[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    return acc;
  }, {});
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !Redis) return null;
  return new Redis({ url, token });
}
const redis = redisClient();

/* --- simple admin check --- */
function getAdminHeader(req) {
  return (req.headers["x-admin-key"] || req.headers["x-admin-secret"] || req.headers["x-admin"] || "").toString();
}
function requireAdmin(req, res) {
  const sent = String(getAdminHeader(req) || "").trim();
  const env = String(process.env.ADMIN_SECRET || "").trim();
  if (!env || !sent || sent !== env) {
    j(res, 401, { ok: false, message: "Unauthorized" });
    return false;
  }
  return true;
}

/* =============== Handler =============== */
module.exports = async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const p = url.pathname;

    // health
    if (p === "/api/health") return j(res, 200, { ok: true });

    // simple echo for debug
    if (p === "/api/_echo") return j(res, 200, { ok: true, method: req.method, headers: req.headers });

    // quota
    if (p === "/api/quota") {
      if (req.method !== "GET") return j(res, 405, { ok: false, message: "Method Not Allowed" });
      try {
        let remaining = Number(process.env.QUOTA_DAILY_LIMIT || 1000);
        if (redis) {
          const used = Number(await redis.get(`aff:global:used:${todayStr()}`)) || 0;
          remaining = Math.max(0, remaining - used);
        }
        return j(res, 200, { ok: true, remaining });
      } catch (e) {
        return j(res, 200, { ok: true, remaining: Number(process.env.QUOTA_DAILY_LIMIT || 1000) });
      }
    }

    // generate
    if (p === "/api/generate") {
      if (req.method !== "POST") return j(res, 405, { ok: false, message: "Method Not Allowed" });
      const b = await readBody(req);
      const linkProduk = String(b.linkProduk || b.link || "").trim();
      const topik = String(b.topik || b.topic || b.topik || "").trim();
      const deskripsi = Array.isArray(b.deskripsi) ? b.deskripsi : (Array.isArray(b.descriptions) ? b.descriptions : []);
      const gaya = String(b.gaya || b.style || "Santai & Ramah");
      const panjang = String(b.panjang || b.length || "Sedang (2-3 paragraf)");
      const jumlah = Math.max(1, Math.min(8, Number(b.jumlah || b.count || b.generateCount || 1)));

      if (!linkProduk) return j(res, 400, { ok: false, message: "linkProduk wajib diisi." });
      if (!topik) return j(res, 400, { ok: false, message: "Nama/Jenis Produk wajib diisi." });
      if ((deskripsi || []).length < 2) return j(res, 400, { ok: false, message: "Minimal 2 kelebihan/keunggulan." });

      // If real LLM integration is not configured, return fallback generated text
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "";
      const scripts = [];
      try {
        if (!GEMINI_API_KEY) {
          // simple placeholder generator (deterministic)
          for (let i = 0; i < jumlah; i++) {
            const title = `${topik} — Variasi ${i + 1}`;
            const contentParts = [];
            contentParts.push(`${topik} hadir untuk kamu yang butuh solusi praktis.`);

            // take up to 3 descriptions
            contentParts.push(`Kenapa pilih ${topik}? ${deskripsi.slice(0, 3).join(", ")}.`);

            if (/Pendek/i.test(panjang)) {
              contentParts.push(`Cek sekarang: ${linkProduk}`);
            } else if (/Sedang/i.test(panjang)) {
              contentParts.push(`Selain harganya yang pas, ${topik} juga menawarkan ${deskripsi.slice(0, 2).join(" dan ")}. Cocok buat keseharian.`);
              contentParts.push(`Detail produk: ${linkProduk}`);
            } else {
              contentParts.push(`Detail lengkap ${topik}: ${deskripsi.join(", ")}. Kunjungi: ${linkProduk}`);
              contentParts.push(`Jangan kelewatan — buruan sebelum habis!`);
            }

            // style tweaks
            let content = contentParts.join("\n\n");
            if (/Santai/i.test(gaya)) content = `✨ Halo! ${content}`;
            if (/Formal/i.test(gaya)) content = content.replace(/^✨ Halo! /, "");
            if (/Promosi/i.test(gaya)) content += `\n\n👉 Dapatkan sekarang di ${linkProduk}`;

            scripts.push({ title, content });
          }
        } else {
          // If you want, integrate real model here (omitted for safety).
          // For now fallback to same behavior.
          for (let i = 0; i < jumlah; i++) {
            scripts.push({ title: `${topik} — Variasi ${i + 1}`, content: `Hasil AI (demo). ${topik}\nKelebihan: ${deskripsi.join(", ")}\nLink: ${linkProduk}` });
          }
        }
      } catch (err) {
        return j(res, 502, { ok: false, message: `Generate error: ${String(err?.message || err)}` });
      }

      // record usage counters (optional)
      try {
        if (redis) {
          await redis.incr(`aff:global:used:${todayStr()}`);
          // user session cookie may not exist; safe ignore
          const cookieName = parseCookies(req)[ "aff_session" ] || null;
          if (cookieName) await redis.incr(`aff:user:used:${todayStr()}:${String(cookieName).toLowerCase()}`);
        }
      } catch (e) { /* ignore */ }

      return j(res, 200, { ok: true, scripts });
    }

    // admin users management (GET/POST/DELETE) -> require admin header
    if (p === "/api/admin/users") {
      if (!requireAdmin(req, res)) return;
      if (!redis) return j(res, 500, { ok: false, message: "Redis tidak dikonfigurasi" });

      if (req.method === "GET") {
        const list = await redis.smembers("aff:users");
        return j(res, 200, { ok: true, users: list || [] });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const n = String(body.name || "").trim().toLowerCase();
        if (!n) return j(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.sadd("aff:users", n);
        return j(res, 200, { ok: true, added: n });
      }
      if (req.method === "DELETE") {
        const body = await readBody(req);
        const n = String(body.name || "").trim().toLowerCase();
        if (!n) return j(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.srem("aff:users", n);
        return j(res, 200, { ok: true, removed: n });
      }
      return j(res, 405, { ok: false, message: "Method Not Allowed" });
    }

    // public listing of users (admin only to add new users)
    if (p === "/api/users") {
      if (req.method === "GET") {
        // public or admin can list if desired; here we allow public read
        if (!redis) return j(res, 200, { ok: true, users: [] });
        const list = await redis.smembers("aff:users");
        return j(res, 200, { ok: true, count: (list||[]).length, users: list || [] });
      }
      if (req.method === "POST") {
        // allow admin creation via header x-admin-key OR accept simple add if no redis?
        if (!requireAdmin(req, res)) return;
        if (!redis) return j(res, 500, { ok: false, message: "Redis tidak dikonfigurasi" });
        const b = await readBody(req);
        const n = String(b.name || "").trim().toLowerCase();
        if (!n) return j(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.sadd("aff:users", n);
        return j(res, 200, { ok: true, id: n, name: n });
      }
      return j(res, 405, { ok: false, message: "Method Not Allowed" });
    }

    // fallback 404
    return j(res, 404, { ok: false, message: "Not Found" });
  } catch (e) {
    return j(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
