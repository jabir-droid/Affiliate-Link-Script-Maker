// api/login-name.js  (CommonJS)
const { Redis } = require("@upstash/redis");

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}
function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(/;\s*/).reduce((acc, p) => {
    const i = p.indexOf("=");
    if (i > -1) acc[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
    return acc;
  }, {});
}
function setCookie(res, name, val, { maxAge = 60 * 60 * 24 * 30, path = "/" } = {}) {
  const cookie = `${name}=${encodeURIComponent(val)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;
  res.setHeader("Set-Cookie", cookie);
}

function redisClient() {
  const url = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}
const redis = redisClient();

const SESSION_COOKIE = "aff_session";
const ALLOW_SET = "aff:users";                 // set nama (lowercase)
const PHONE_KEY = (name) => `aff:user:${name}:phone`;

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method Not Allowed" });
    const body = JSON.parse((await readBody(req)) || "{}");
    const rawName = String(body.name || "").trim().toLowerCase();
    const rawPhone = String(body.phone || "").trim();

    if (!rawName) return json(res, 400, { ok: false, message: "Nama wajib diisi" });
    if (!/^(0|\+62)\d{7,15}$/.test(rawPhone)) return json(res, 400, { ok: false, message: "Nomor HP tidak valid" });

    if (redis) {
      // 1) harus terdaftar di allowlist
      const allowed = await redis.sismember(ALLOW_SET, rawName);
      if (!allowed) return json(res, 403, { ok: false, message: "Nama tidak terdaftar. Hubungi admin." });

      // 2) jika KV punya phone tersimpan -> cocokkan
      const saved = await redis.get(PHONE_KEY(rawName));
      if (saved) {
        if (String(saved) !== rawPhone) {
          return json(res, 403, { ok: false, message: "Nomor HP tidak cocok." });
        }
      } else {
        // belum ada -> simpan pertama kali (opsional)
        await redis.set(PHONE_KEY(rawName), rawPhone);
      }
    }

    setCookie(res, SESSION_COOKIE, rawName, { maxAge: 60 * 60 * 24 * 30 });
    return json(res, 200, { ok: true, name: rawName });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
