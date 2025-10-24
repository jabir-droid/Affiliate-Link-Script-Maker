// api/me.js
const { json, getCookie, redis, SESSION_COOKIE, PHONE_KEY } = require("./_utils");

const r = redis();

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") return json(res, 405, { ok: false, message: "Method Not Allowed" });

    const name = (getCookie(req, SESSION_COOKIE) || "").trim().toLowerCase();
    if (!name) return json(res, 200, { ok: false });

    let phone = null;
    if (r) {
      try { phone = await r.get(PHONE_KEY(name)); } catch {}
    }
    return json(res, 200, { ok: true, name, phone: phone || null });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
