// api/admin/revoke.js
// POST /api/admin/revoke
// Header: x-admin-secret: <ADMIN_SECRET>
// Body JSON: { "userId": "alice", "action": "reset" | "revoke" }

const { Redis } = require("@upstash/redis");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
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

    const { userId, action } = parseBody(req);
    if (!userId || !action) {
      res.status(400).json({ ok: false, message: "userId & action wajib." });
      return;
    }

    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      res.status(200).json({
        ok: true,
        connected: false,
        hint: "Upstash belum dikonfigurasi; operasi dianggap sukses (no-op).",
      });
      return;
    }

    const redis = new Redis({ url, token });
    const date = today();
    const USER_KEY = `usage:${date}:user:${userId}`;

    if (action === "reset" || action === "revoke") {
      await redis.del(USER_KEY);
      res.json({ ok: true, action, userId });
      return;
    }

    res.status(400).json({ ok: false, message: "action tidak dikenal." });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "Server error" });
  }
};

function parseBody(req) {
  try {
    if (typeof req.body === "object") return req.body;
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function today() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
