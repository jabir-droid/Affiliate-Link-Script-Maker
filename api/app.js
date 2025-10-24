// api/app.js (cuplikan)
const { handlerLoginName } = require("./server/login-name");
const { handlerMe }        = require("./server/me");
const { handlerLogout }    = require("./server/logout");
const { handlerUsers }     = require("./server/users");
const { handlerUsage }     = require("./server/usage");
// ...dst

module.exports = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (p === "/api/login-name") return handlerLoginName(req, res);
  if (p === "/api/me")         return handlerMe(req, res);
  if (p === "/api/logout")     return handlerLogout(req, res);
  if (p === "/api/users")      return handlerUsers(req, res);
  if (p === "/api/usage")      return handlerUsage(req, res);

  // fallback
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok:false, message:"Not Found" }));
};
