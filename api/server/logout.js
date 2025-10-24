// api/logout.js
const { json, clearCookie, SESSION_COOKIE } = require("./_utils");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return json(res, 405, { ok: false, message: "Method Not Allowed" });
    }
    clearCookie(res, SESSION_COOKIE);
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
