// api/_utils.js
import { Redis } from "@upstash/redis";

export function makeRedis() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch (e) {
    console.error("Redis init failed:", e?.message || e);
    return null;
  }
}

export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

export async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

export function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function setCookie(res, name, val, { days = 30 } = {}) {
  const maxAge = days * 24 * 60 * 60;
  const cookie = `${name}=${encodeURIComponent(val)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly; Secure`;
  res.setHeader("Set-Cookie", cookie);
}

export function clearCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly; Secure`
  );
}

export function getCookie(req, name) {
  const raw = req.headers?.cookie || "";
  const map = Object.fromEntries(
    raw.split(";").map((p) => {
      const i = p.indexOf("=");
      if (i === -1) return [p.trim(), ""];
      return [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1))];
    })
  );
  return map[name];
}
