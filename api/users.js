// api/users.js
const { j, readJson, requireAdmin, getRedis } = require("./_utils");
const SET = "aff:users"; // simpan sebagai Set di Redis

module.exports = async (req, res) => {
  try {
    const redis = getRedis();

    // GET: daftar user (tanpa auth agar bisa dipakai /admin.html?view, tetapi aman karena hanya id)
    if (req.method === "GET") {
      if (!redis) return j(res, 200, { ok: true, users: [], count: 0, max: 50 });
      const users = (await redis.smembers(SET)) || [];
      return j(res, 200, { ok: true, users: users.map((id) => ({ id })), count: users.length, max: 50 });
    }

    // POST / DELETE: butuh admin
    if (!requireAdmin(req, res)) return;

    if (req.method === "POST") {
      const body = await readJson(req);
      const name = String(body.name || "").trim().toLowerCase();
      if (!name) return j(res, 400, { ok: false, message: "name required" });
      if (!redis) return j(res, 500, { ok: false, message: "redis not configured" });
      await redis.sadd(SET, name);
      return j(res, 200, { ok: true, id: name, name });
    }

    if (req.method === "DELETE") {
      const body = await readJson(req);
      const name = String(body.name || "").trim().toLowerCase();
      if (!name) return j(res, 400, { ok: false, message: "name required" });
      if (!redis) return j(res, 500, { ok: false, message: "redis not configured" });
      await redis.srem(SET, name);
      return j(res, 200, { ok: true, removed: name });
    }

    return j(res, 405, { ok: false, message: "Method Not Allowed" });
  } catch (e) {
    return j(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
