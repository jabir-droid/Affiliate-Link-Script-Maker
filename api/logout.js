// /api/logout.js
import { getRedis, json, setCors, readJsonBody, parseCookies, clearCookie } from "./_utils.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method Not Allowed" });

  const redis = getRedis();
  const cookies = parseCookies(req);
  const sid = cookies["session"];

  if (redis && sid) {
    try { await redis.del(`sess:${sid}`); } catch {}
  }

  clearCookie(res, "session");
  return json(res, 200, { ok: true });
}
