// api/admin/users.js
// Admin API untuk mengelola allowlist nama (akses via Lynk.id)
// Method:
//   GET    -> list semua nama yang diizinkan
//   POST   -> body { name }  -> tambahkan ke allowlist
//   DELETE -> body { name }  -> hapus dari allowlist
//
// Proteksi: header "x-admin-key: <ADMIN_SECRET>"

import { Redis } from "@upstash/redis";

// --- Redis client (ambil dari ENV yang sama seperti generate.js) ---
function redisClient() {
  const url =
    process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const ALLOW_SET = "aff:allow:names"; // set berisi nama yang boleh login
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

// normalisasi nama (biar konsisten)
function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") // rapikan spasi berlebih
    .slice(0, 80);
}

// CORS basic
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-admin-key");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  // cek admin key
  const key = req.headers["x-admin-key"];
  if (!ADMIN_SECRET || key !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const redis = redisClient();
  if (!redis) {
    return res
      .status(500)
      .json({ ok: false, message: "Redis not configured on server." });
  }

  try {
    if (req.method === "GET") {
      const list = await redis.smembers(ALLOW_SET);
      // kembalikan urut A-Z biar rapi
      const names = (Array.isArray(list) ? list : []).sort((a, b) =>
        String(a).localeCompare(String(b))
      );
      return res.status(200).json({ ok: true, names });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "object" ? req.body : {};
      const raw = body.name ?? "";
      const name = normalizeName(raw);
      if (!name) return res.status(400).json({ ok: false, message: "name kosong" });

      await redis.sadd(ALLOW_SET, name);
      return res.status(200).json({ ok: true, message: "added", name });
    }

    if (req.method === "DELETE") {
      const body = typeof req.body === "object" ? req.body : {};
      const raw = body.name ?? "";
      const name = normalizeName(raw);
      if (!name) return res.status(400).json({ ok: false, message: "name kosong" });

      await redis.srem(ALLOW_SET, name);
      return res.status(200).json({ ok: true, message: "removed", name });
    }

    res.setHeader("Allow", "GET,POST,DELETE,OPTIONS");
    return res.status(405).json({ ok: false, message: "Method Not Allowed" });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, message: String(e?.message || e) });
  }
}
