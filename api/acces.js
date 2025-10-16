// api/access.js
import { Redis } from "@upstash/redis";

function redisClient() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const MAX_USERS = Number(process.env.MAX_USERS || 50);

function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  }

  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ ok: false, message: "Nama wajib diisi." });
  }

  const redis = redisClient();
  const userId = slugify(name);
  const USERS_SET = "aff:users";

  if (!redis) {
    return res.status(200).json({
      ok: true,
      registered: true,
      userId,
      name,
      remainingSlots: MAX_USERS,
      hint:
        "Upstash belum dikonfigurasi—pendaftaran tidak benar-benar dibatasi.",
    });
  }

  try {
    const count = await redis.scard(USERS_SET);
    const isMember = await redis.sismember(USERS_SET, userId);

    if (!isMember && count >= MAX_USERS) {
      return res.status(200).json({
        ok: true,
        registered: false,
        full: true,
        remainingSlots: 0,
        message: "Slot pengguna telah penuh.",
      });
    }

    await redis.sadd(USERS_SET, userId);
    // GANTI hsetnx → hset (aman; kalau sudah ada akan overwrite, tapi tidak masalah)
    await redis.hset(`aff:user:meta:${userId}`, {
      name: String(name).trim(),
      createdAt: Date.now(),
    });

    const newCount = await redis.scard(USERS_SET);
    const remaining = Math.max(0, MAX_USERS - newCount);

    return res.status(200).json({
      ok: true,
      registered: true,
      userId,
      name,
      remainingSlots: remaining,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, message: String(err?.message || err) });
  }
}
