// /api/quota.js
import { Redis } from "@upstash/redis";

function redisClient() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const DAILY_LIMIT = Number(process.env.MAX_DAILY_QUOTA || 1000);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  const redis = redisClient();
  const date = todayStr();

  let used = 0;
  if (redis) {
    try {
      used = Number((await redis.get(`aff:global:used:${date}`)) || 0);
    } catch {
      used = 0;
    }
  }
  const remaining = Math.max(0, DAILY_LIMIT - used);

  return res.status(200).json({
    ok: true,
    date,
    limit: DAILY_LIMIT,
    used,
    remaining,
    label: `${remaining}/${DAILY_LIMIT}`,
  });
}
