// api/login-name.js
import { redisClient, slugify, sign, setHttpOnlyCookie } from "./_utils";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  const { name } = (typeof req.body === "object" ? req.body : {}) || {};
  const id = slugify(name || "");
  if (!id) return res.status(400).json({ ok: false, message: "Nama wajib diisi." });

  const redis = redisClient();
  if (!redis) return res.status(500).json({ ok: false, message: "Redis tidak terkonfigurasi." });

  const allowed = await redis.sismember("aff:allow", id);
  if (!allowed) return res.status(401).json({ ok: false, message: "Nama tidak terdaftar. Hubungi admin." });

  const token = sign({ id, t: Date.now() });
  setHttpOnlyCookie(res, "aff_token", token, 30);
  return res.status(200).json({ ok: true, id });
}
