// /api/_utils.js
import { Redis } from "@upstash/redis";
import crypto from "crypto";

export function getRedis() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(obj));
}

export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Body bukan JSON valid");
  }
}

export function parseCookies(req) {
  const header = req.headers?.cookie || req.headers?.Cookie || "";
  const out = {};
  header.split(/;\s*/).forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > -1) out[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1));
  });
  return out;
}

export function setCookie(res, name, value, { maxAgeSec = 0 } = {}) {
  const attrs = [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Secure` // pada Vercel (HTTPS) ok
  ];
  if (maxAgeSec > 0) attrs.push(`Max-Age=${maxAgeSec}`);
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; ${attrs.join("; ")}`);
}

export function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`);
}

export function genSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

export function slugify(name) {
  return String(name || "")
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

export async function requireSession(req) {
  const redis = getRedis();
  if (!redis) return null; // kalau tidak ada Redis, anggap tanpa proteksi (dev)
  const cookies = parseCookies(req);
  const sid = cookies["session"];
  if (!sid) return null;
  const data = await redis.get(`sess:${sid}`);
  return data || null; // { user: '...', createdAt: 123 }
}
