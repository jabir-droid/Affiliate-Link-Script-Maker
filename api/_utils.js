// api/_utils.js
const { Redis } = require("@upstash/redis");

// --- JSON helpers ---
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

// --- header & admin key ---
function getHeader(req, name) {
  // Node membuat semua header lower-case
  return req.headers[String(name).toLowerCase()] || "";
}
function getAdminHeader(req) {
  // terima beberapa alias header agar tidak gagal karena salah nama
  return (
    getHeader(req, "x-admin-key") ||
    getHeader(req, "x-admin-secret") ||
    getHeader(req, "x-admin") ||
    ""
  );
}
function getAdminEnv() {
  return process.env.ADMIN_SECRET || "";
}
function requireAdmin(req, res) {
  const sent = String(getAdminHeader(req) || "").trim();
  const env = String(getAdminEnv() || "").trim();
  if (!env || !sent || sent !== env) {
    j(res, 401, { ok: false, message: "Unauthorized" });
    return null;
  }
  return sent;
}

// --- Redis (opsional) ---
function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

module.exports = { j, readJson, getAdminHeader, getAdminEnv, requireAdmin, getRedis };
