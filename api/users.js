// api/users.js
import { json, readBody, getRedis } from "./_utils.js";

const ALLOW_SET = "aff:allow";

export default async function handler(req, res) {
  const admin = req.headers["x-admin-key"];
  const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

  // Hanya GET boleh tanpa admin (opsional). POST/DELETE wajib admin.
  const redis = getRedis();
  if (!redis) return json(res, 500, { ok: false, message: "Store belum dikonfigurasi" });

  try {
    if (req.method === "GET") {
      const users = await redis.smembers(ALLOW_SET);
      return json(res, 200, { ok: true, count: users.length, users: users.map(id => ({ id })), max: 5000 });
    }

    if (admin !== ADMIN_SECRET) return json(res, 401, { ok: false, message: "Unauthorized" });

    if (req.method === "POST") {
      const { name } = JSON.parse((await readBody(req)) || "{}");
      const id = String(name || "").trim().toLowerCase();
      if (!id) return json(res, 400, { ok: false, message: "Nama wajib diisi" });
      await redis.sadd(ALLOW_SET, id);
      return json(res, 200, { ok: true, id, name: id });
    }

    if (req.method === "DELETE") {
      const { name } = JSON.parse((await readBody(req)) || "{}");
      const id = String(name || "").trim().toLowerCase();
      if (!id) return json(res, 400, { ok: false, message: "Nama wajib diisi" });
      await redis.srem(ALLOW_SET, id);
      return json(res, 200, { ok: true, id, removed: true });
    }

    return json(res, 405, { ok: false, message: "Method Not Allowed" });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
}
