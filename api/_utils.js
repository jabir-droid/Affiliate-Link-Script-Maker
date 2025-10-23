// /api/_utils.js
import { Redis } from "@upstash/redis";

/* ---------- helpers ---------- */
export function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

export async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export function getRedis() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/* ---------- constants ---------- */
export const ALLOW_SET = "aff:allow";           // 1 sumber kebenaran
export const SESSION_COOKIE = "aff_session";

/* ---------- admin check ---------- */
export function getAdminHeader(req) {
  return (
    req.headers["x-admin-key"] ||
    req.headers["x-admin-secret"] || // kompatibel
    req.headers["x-admin"] ||
    ""
  );
}

export function isAdmin(req) {
  const secret = process.env.ADMIN_SECRET || "";
  return secret && getAdminHeader(req) === secret;
}
