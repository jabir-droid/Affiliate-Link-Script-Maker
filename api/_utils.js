// api/_utils.js
import { Redis } from "@upstash/redis";

/* ---------- JSON helpers ---------- */
export function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

export async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const str = Buffer.concat(chunks).toString("utf8");
  try { return str ? JSON.parse(str) : {}; } catch { return {}; }
}

/* ---------- Cookie helpers (tanpa lib eksternal) ---------- */
export function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(/;\s*/).reduce((acc, p) => {
    const i = p.indexOf("=");
    if (i > -1) acc[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    return acc;
  }, {});
}
export function setCookie(res, name, val, { maxAge = 60 * 60 * 24 * 30, path = "/" } = {}) {
  const cookie = `${name}=${encodeURIComponent(val)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
  res.setHeader("Set-Cookie", cookie);
}
export function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

/* ---------- Biz helpers ---------- */
export const SESSION_COOKIE = "aff_session";
export const ALLOW_SET = "aff:users";
export const normalizeName = (s) => String(s || "").trim().toLowerCase();

export function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
