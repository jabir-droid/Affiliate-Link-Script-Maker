// api/_echo.js
module.exports = async (req, res) => {
  const headers = req.headers || {};
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      method: req.method,
      path: req.url,
      headers,
    })
  );
};
