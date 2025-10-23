// /api/users.js
import { json, readBody, getRedis, ALLOW_SET, isAdmin } from "./_utils.js";

export default async function handler(req, res) {
  const redis = getRedis();
  if (!redis) return json(res, 500, { ok: false, message: "Store belum dikonfigurasi" });

  try {
    if (req.method === "GET") {
      // GET boleh tanpa admin: untuk menampilkan list (opsional)
      const users = (await redis.smembers(ALLOW_SET)) || [];
      return json(res, 200, {
        ok: true,
        count: users.length,
        users: users.map((id) => ({ id })),
        max: 5000,
      });
    }

    // POST & DELETE wajib admin
    if (!isAdmin(req)) return json(res, 401, { ok: false, message: "Unauthorized" });

    if (req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const id = String(body.name || body.id || "").trim().toLowerCase();
      if (!id) return json(res, 400, { ok: false, message: "Nama wajib diisi" });
      await redis.sadd(ALLOW_SET, id);
      return json(res, 200, { ok: true, id });
    }

    if (req.method === "DELETE") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const id = String(body.name || body.id || "").trim().toLowerCase();
      if (!id) return json(res, 400, { ok: false, message: "Nama wajib diisi" });
      await redis.srem(ALLOW_SET, id);
      return json(res, 200, { ok: true, id, removed: true });
    }

    return json(res, 405, { ok: false, message: "Method Not Allowed" });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
}
