// api/_utils.js
import { Redis } from "@upstash/redis";
import crypto from "crypto";

export function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function slugify(name = "") {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SECRET = process.env.ADMIN_SECRET || "devsecret";

export function sign(payloadObj) {
  const payload = JSON.stringify(payloadObj);
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

export function verify(token = "") {
  try {
    const [b64, sig] = token.split(".");
    if (!b64 || !sig) return null;
    const expect = crypto.createHmac("sha256", SECRET).update(b64).digest("hex");
    if (sig !== expect) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    return payload || null;
  } catch {
    return null;
  }
}

export function getCookie(req, name) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setHttpOnlyCookie(res, name, value, maxAgeDays = 30) {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  res.setHeader("Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; ${
      process.env.VERCEL ? "Secure;" : ""
    }`);
}
