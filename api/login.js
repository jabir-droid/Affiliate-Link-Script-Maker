// /api/login.js
import { getRedis, json, setCors, readJsonBody, setCookie, genSessionId } from "./_utils.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method Not Allowed" });

  const body = await readJsonBody(req);
  const { username, password } = body;

  const allowedUser = process.env.ALLOWED_USER || "admin";
  const allowedPass = process.env.ALLOWED_PASS || "bimart2025";
  if (!username || !password) return json(res, 400, { ok: false, message: "username & password wajib diisi" });

  if (username !== allowedUser || password !== allowedPass) {
    return json(res, 401, { ok: false, message: "Nama atau password salah" });
  }

  const redis = getRedis();
  const sid = genSessionId();
  const ttlDays = Number(process.env.SESSION_TTL_DAYS || 7);
  const ttlSec = ttlDays * 24 * 60 * 60;

  if (redis) {
    await redis.set(`sess:${sid}`, { user: username, createdAt: Date.now() }, { ex: ttlSec });
  }

  setCookie(res, "session", sid, { maxAgeSec: ttlSec });
  return json(res, 200, { ok: true, user: username });
}
