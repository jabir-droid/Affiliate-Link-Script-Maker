// api/usage.js
// GET /api/usage  (admin only)
// Header:  x-admin-secret: <ADMIN_SECRET>

const { Redis } = require("@upstash/redis");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, message: "Method Not Allowed" });
      return;
    }

    const adminSecretEnv = process.env.ADMIN_SECRET || "";
    const adminHeader =
      req.headers["x-admin-secret"] || req.headers["x-admin"] || "";

    if (!adminSecretEnv || adminHeader !== adminSecretEnv) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }

    const QUOTA =
      Number(process.env.QUOTA_DAILY_LIMIT ||
        process.env.MAX_GLOBAL_PER_DAY ||
        1000);

    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    // Jika Upstash belum dikonfigurasi, balikan dummy
    if (!url || !token) {
      res.json({
        ok: true,
        connected: false,
        hint:
          "Upstash Redis belum dikonfigurasi (KV_REST_API_URL & KV_REST_API_TOKEN).",
        date: today(),
        limit: QUOTA,
        globalUsed: 0,
        remaining: QUOTA,
        users: [],
      });
      return;
    }

    const redis = new Redis({ url, token });
    const date = today();
    const GLOBAL_KEY = `usage:${date}:global`;
    const USER_PREFIX = `usage:${date}:user:`;

    // global counter
    const globalUsed = Number((await redis.get(GLOBAL_KEY)) || 0);

    // scan semua user hari ini
    let cursor = 0;
    const users = [];
    do {
      const [next, keys] = await redis.scan(cursor, {
        match: `${USER_PREFIX}*`,
        count: 500,
      });
      cursor = Number(next);
      if (keys && keys.length) {
        const vals = await redis.mget(...keys);
        keys.forEach((k, i) => {
          const id = k.replace(USER_PREFIX, "");
          users.push({ id, used: Number(vals[i] || 0) });
        });
      }
    } while (cursor !== 0);

    res.json({
      ok: true,
      connected: true,
      date,
      limit: QUOTA,
      globalUsed,
      remaining: Math.max(QUOTA - globalUsed, 0),
      users,
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "Server error" });
  }
};

function today() {
  // gunakan UTC supaya konsisten; kalau mau WIB tinggal geser
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`; // e.g., 20251008
}
