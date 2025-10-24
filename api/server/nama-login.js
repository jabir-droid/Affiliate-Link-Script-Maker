// api/login-name.js
import { makeRedis, json, readJson, setCookie, slugify } from "./_utils";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { ok: false, message: "Method Not Allowed" });
    }

    const body = await readJson(req);
    const rawName = String(body?.name || "").trim();
    if (!rawName) return json(res, 400, { ok: false, message: "Nama wajib diisi." });

    const name = slugify(rawName);
    const redis = makeRedis();
    const KEY = "aff:allow:lynk";

    // If Redis not configured, allow everything (dev fallback) but mark it
    if (!redis) {
      setCookie(res, "aff_name", name);
      return json(res, 200, { ok: true, devModeNoRedis: true });
    }

    // Check allowlist
    let allowed = false;
    try {
      allowed = await redis.sismember(KEY, name);
    } catch (e) {
      console.error("Redis sismember failed:", e?.message || e);
      // Fail closed if Redis is configured but error happens
      return json(res, 503, { ok: false, message: "Service unavailable. Coba lagi." });
    }

    if (!allowed) {
      return json(res, 403, {
        ok: false,
        message: "Nama tidak terdaftar. Hubungi admin.",
      });
    }

    // Set session cookie
    setCookie(res, "aff_name", name, { days: 30 });
    return json(res, 200, { ok: true });
  } catch (e) {
    console.error("login-name crashed:", e?.stack || e);
    return json(res, 500, { ok: false, message: "Server error." });
  }
}
