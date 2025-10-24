// api/usage.js
// GET /api/usage
const { j, requireAdmin, getRedis } = require("./_utils");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") return j(res, 405, { ok: false, message: "Method Not Allowed" });
    if (!requireAdmin(req, res)) return;

    const redis = getRedis();
    const today = new Date();
    const yyyymmdd = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`;

    if (!redis) {
      return j(res, 200, {
        ok: true,
        date: yyyymmdd,
        quota_daily: Number(process.env.QUOTA_DAILY_LIMIT || 1000),
        global_used: 0,
        per_user: []
      });
    }

    const globalKey = `aff:global:used:${yyyymmdd}`;
    const usersKeyPattern = `aff:user:used:${yyyymmdd}:*`;

    const globalUsed = Number(await redis.get(globalKey)) || 0;

    // scan per-user
    const per_user = [];
    let cursor = 0;
    do {
      const resp = await redis.scan(cursor, { match: usersKeyPattern, count: 100 });
      cursor = Number(resp[0]);
      const keys = resp[1] || [];
      if (keys.length) {
        const vals = await redis.mget(...keys);
        keys.forEach((k, idx) => {
          const name = k.split(":").pop();
          per_user.push({ name, used: Number(vals[idx] || 0) });
        });
      }
    } while (cursor !== 0);

    return j(res, 200, {
      ok: true,
      date: yyyymmdd,
      quota_daily: Number(process.env.QUOTA_DAILY_LIMIT || 1000),
      global_used: globalUsed,
      per_user
    });
  } catch (e) {
    return j(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
