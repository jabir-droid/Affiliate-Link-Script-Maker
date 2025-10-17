// api/login-name.js
import { json, readJson, setCookie, normalizeName, redisClient, ALLOW_SET, SESSION_COOKIE } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, message: "Method Not Allowed" });
  }

  const body = await readJson(req);
  const name = normalizeName(body.name);
  if (!name) return json(res, 400, { ok: false, message: "Nama wajib diisi" });

  const redis = redisClient();
  if (redis) {
    const allowed = await redis.sismember(ALLOW_SET, name);
    if (!allowed) {
      return json(res, 403, { ok: false, message: "Nama tidak terdaftar. Hubungi admin." });
    }
  }

  setCookie(res, SESSION_COOKIE, name, { maxAge: 60 * 60 * 24 * 30, path: "/" });
  return json(res, 200, { ok: true, name });
}
