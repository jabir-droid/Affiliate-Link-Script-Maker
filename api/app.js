// api/app.js
const { j } = require("../server/_utils");

// import helper modules (not functions to Vercel anymore)
const usage      = require("../server/usage");
const users      = require("../server/users");
const loginName  = require("../server/login-name");
const me         = require("../server/me");
const logout     = require("../server/logout");
// const access  = require("../server/access"); // if you use it
// const models  = require("../server/models"); // if you use it

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    // health / ping
    if (p === "/api/ping") {
      return j(res, 200, { ok: true, ts: Date.now() });
    }

    // basic admin env info for admin page
    if (p === "/api/admin/env") {
      const kvUrl   = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
      const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
      return j(res, 200, {
        ok: true,
        adminSecret: !!process.env.ADMIN_SECRET,
        kvUrl: !!kvUrl,
        kvToken: !!kvToken
      });
    }

    // route mapping
    if (p === "/api/usage")      return usage(req, res);
    if (p === "/api/users")      return users(req, res);
    if (p === "/api/login-name") return loginName(req, res);
    if (p === "/api/me")         return me(req, res);
    if (p === "/api/logout")     return logout(req, res);

    // fallback
    return j(res, 404, { ok: false, message: "Not Found" });
  } catch (e) {
    return j(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
