// api/admin/usage.js
import { Redis } from "@upstash/redis";

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = redisClient();

export default async function handler(req, res) {
  if (!redis) return json(res, 500, { ok: false, message: "Redis belum dikonfigurasi di environment." });

  // Proteksi admin
  const key = req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_SECRET) {
    return json(res, 401, { ok: false, message: "Unauthorized" });
  }

  // Cek tanggal tertentu (optional)
  const url = new URL(req.url, `http://${req.headers.host}`);
  const date = url.searchParams.get("date") || todayStr();

  try {
    const globalUsed = Number(await redis.get(`aff:global:used:${date}`)) || 0;
    const maxDaily = 1000; // batas harian global
    const remaining = Math.max(0, maxDaily - globalUsed);

    const users = (await redis.smembers("aff:users")) || [];
    const perUser = await Promise.all(
      users.map(async (u) => {
        const c = Number(await redis.get(`aff:user:used:${date}:${u}`)) || 0;
        return { user: u, used: c };
      })
    );

    const perUserUsed = perUser.filter(x => x.used > 0).sort((a, b) => b.used - a.used);

    return json(res, 200, {
      ok: true,
      date,
      globalUsed,
      remaining,
      perUser: perUserUsed,
    });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
}
