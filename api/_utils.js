// api/_utils.js
const { Redis } = require("@upstash/redis");

/** JSON response helper */
function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

/** read whole body into string */
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

/** read JSON body safely */
async function readJson(req) {
  const s = await readBody(req);
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

/** cookie utils */
function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(/;\s*/).reduce((acc, p) => {
    const i = p.indexOf("=");
    if (i > -1) acc[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    return acc;
  }, {});
}
function getCookie(req, name) {
  const c = parseCookies(req)[name];
  return c ? String(c) : null;
}
function setCookie(res, name, val, { maxAge = 60 * 60 * 24 * 30, path = "/" } = {}) {
  const cookie = `${name}=${encodeURIComponent(val)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
  res.setHeader("Set-Cookie", cookie);
}
function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

/** Redis client (Upstash) */
function redis() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/** shared keys */
const SESSION_COOKIE = "aff_session";           // simpan "name" yg login (lowercase)
const ALLOW_SET = "aff:users";                  // allowlist nama
const PHONE_KEY = (name) => `aff:user:${name}:phone`;
const TODAY = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
};

module.exports = {
  json, readBody, readJson,
  parseCookies, getCookie, setCookie, clearCookie,
  redis, SESSION_COOKIE, ALLOW_SET, PHONE_KEY, TODAY
};
