const loginName = require("../server/login-name");
const me = require("../server/me");
const logout = require("../server/logout");
const users = require("../server/users");
const usage = require("../server/usage");

module.exports = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (p === "/api/login-name") return loginName(req, res);
  if (p === "/api/me") return me(req, res);
  if (p === "/api/logout") return logout(req, res);
  if (p === "/api/users") return users(req, res);
  if (p === "/api/usage") return usage(req, res);

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: false, message: "Not Found" }));
};
