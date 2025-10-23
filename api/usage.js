// /api/usage.js
import { json, getRedis, ALLOW_SET, isAdmin } from "./_utils.js";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false, message: "Method Not Allowed" });
  if (!isAdmin(req)) return json(res, 401, { ok: false, message: "Unauthorized" });

  const redis = getRedis();
  if (!redis) return json(res, 500, { ok: false, message: "Store belum dikonfigurasi" });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const date = url.searchParams.get("date") || todayStr();

    const globalUsed = Number(await redis.get(`aff:global:used:${date}`)) || 0;
    const maxDaily = Number(process.env.MAX_GLOBAL_PER_DAY || 1000);
    const remaining = Math.max(0, maxDaily - globalUsed);

    // gunakan set yang sama dengan users.js
    const users = (await redis.smembers(ALLOW_SET)) || [];
    const perUser = await Promise.all(
      users.map(async (u) => {
        const c = Number(await redis.get(`aff:user:used:${date}:${u}`)) || 0;
        return { user: u, used: c };
      })
    );

    // tampilkan yang >0 saja, urut desc
    const perUserUsed = perUser.filter((x) => x.used > 0).sort((a, b) => b.used - a.used);

    return json(res, 200, { ok: true, date, globalUsed, remaining, perUser: perUserUsed });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
}
