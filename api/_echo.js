// api/_echo.js
module.exports = (req, res) => {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    method: req.method,
    headers: req.headers
  }, null, 2));
};
