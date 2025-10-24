// api/app.js
// Satu Serverless Function untuk semua endpoint API
const { Redis } = require("@upstash/redis");

/* ========== Helpers ========== */
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
function getHeader(req, name) {
  return req.headers[String(name).toLowerCase()] || "";
}
function getAdminEnv() {
  return process.env.ADMIN_SECRET || "";
}
function requireAdmin(req, res) {
  const incoming =
    getHeader(req, "x-admin-key") ||
    getHeader(req, "x-admin-secret") ||
    getHeader(req, "x-admin") ||
    "";
  const env = getAdminEnv() || "";
  if (!env || !incoming || incoming !== env) {
    j(res, 401, { ok: false, message: "Unauthorized" });
    return null;
  }
  return incoming;
}
function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
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
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(val)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
  );
}
function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

/* ========== Konstanta bisnis ========== */
const SESSION_COOKIE = "aff_session";
const ALLOW_SET = "aff:users";

/* ========== Handler tunggal ========== */
module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    /* ------- ping ------- */
    if (p === "/api/ping" && req.method === "GET") {
      return j(res, 200, { ok: true, ts: Date.now(), method: req.method, ua: req.headers["user-agent"] || "" });
    }

    /* ------- ADMIN: cek env ------- */
    if (p === "/api/admin/env" && req.method === "GET") {
      const hasAdmin = !!getAdminEnv();
      const hasRedis =
        !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
        !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
      return j(res, 200, {
        ok: true,
        adminSecret: hasAdmin,
        redis: hasRedis,
        quotaDaily: Number(process.env.QUOTA_DAILY_LIMIT || 1000),
      });
    }

    /* ------- ADMIN: users (allowlist) ------- */
    if (p === "/api/admin/users") {
      if (!requireAdmin(req, res)) return;
      const redis = getRedis();
      if (!redis) return j(res, 500, { ok: false, message: "Redis belum dikonfigurasi" });

      if (req.method === "GET") {
        const members = await redis.smembers(ALLOW_SET);
        return j(res, 200, { ok: true, users: members || [] });
      }
      if (req.method === "POST") {
        const body = await readJson(req);
        const name = String(body.name || "").trim().toLowerCase();
        if (!name) return j(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.sadd(ALLOW_SET, name);
        return j(res, 200, { ok: true, added: name });
      }
      if (req.method === "DELETE") {
        const body = await readJson(req);
        const name = String(body.name || "").trim().toLowerCase();
        if (!name) return j(res, 400, { ok: false, message: "Nama wajib diisi" });
        await redis.srem(ALLOW_SET, name);
        return j(res, 200, { ok: true, removed: name });
      }
      return j(res, 405, { ok: false, message: "Method Not Allowed" });
    }

    /* ------- ADMIN: usage harian ------- */
    if (p === "/api/admin/usage" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const redis = getRedis();
      const ymd = todayStr();
      const QUOTA = Number(process.env.QUOTA_DAILY_LIMIT || 1000);

      if (!redis) {
        return j(res, 200, {
          ok: true,
          date: ymd,
          quota_daily: QUOTA,
          global_used: 0,
          per_user: [],
        });
      }

      const globalKey = `aff:global:used:${ymd}`;
      const pattern = `aff:user:used:${ymd}:*`;
      const globalUsed = Number(await redis.get(globalKey)) || 0;

      const per_user = [];
      let cursor = 0;
      do {
        const resp = await redis.scan(cursor, { match: pattern, count: 100 });
        cursor = Number(resp[0]);
        const keys = resp[1] || [];
        if (keys.length) {
          const vals = await redis.mget(...keys);
          keys.forEach((k, i) => {
            const name = k.split(":").pop();
            per_user.push({ name, used: Number(vals[i] || 0) });
          });
        }
      } while (cursor !== 0);

      return j(res, 200, {
        ok: true,
        date: ymd,
        quota_daily: QUOTA,
        global_used: globalUsed,
        per_user,
      });
    }

    /* ------- Login pakai nama Lynk.id ------- */
    if (p === "/api/login-name" && req.method === "POST") {
      const body = await readJson(req);
      const raw = String(body.name || "").trim().toLowerCase();
      if (!raw) return j(res, 400, { ok: false, message: "Nama wajib diisi" });

      const redis = getRedis();
      if (redis) {
        const allowed = await redis.sismember(ALLOW_SET, raw);
        if (!allowed) return j(res, 403, { ok: false, message: "Nama tidak terdaftar. Hubungi admin." });
      }
      setCookie(res, SESSION_COOKIE, raw);
      return j(res, 200, { ok: true, name: raw });
    }

    /* ------- Me ------- */
    if (p === "/api/me" && req.method === "GET") {
      const name = parseCookies(req)[SESSION_COOKIE];
      return j(res, 200, { ok: !!name, name: name || null });
    }

    /* ------- Logout ------- */
    if (p === "/api/logout" && req.method === "POST") {
      clearCookie(res, SESSION_COOKIE);
      return j(res, 200, { ok: true });
    }

    /* ------- Kuota sederhana ------- */
    if (p === "/api/quota" && req.method === "GET") {
      const redis = getRedis();
      const QUOTA = Number(process.env.QUOTA_DAILY_LIMIT || 1000);
      try {
        const used = redis ? Number(await redis.get(`aff:global:used:${todayStr()}`)) || 0 : 0;
        return j(res, 200, { ok: true, remaining: Math.max(0, QUOTA - used) });
      } catch {
        return j(res, 200, { ok: true, remaining: QUOTA });
      }
    }

    /* ------- Not found ------- */
    return j(res, 404, { ok: false, message: "Not Found" });
  } catch (e) {
    return j(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
