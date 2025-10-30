// api/debug-echo.js
// Temporary debug endpoint — hapus setelah selesai
module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const headers = req.headers || {};
  const adminHeader = headers["x-admin-key"] || headers["x-admin-secret"] || headers["x-admin"] || null;

  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    now: Date.now(),
    path: req.url || null,
    method: req.method || null,
    received_admin_header: adminHeader,
    received_headers_sample: {
      "x-admin-key": headers["x-admin-key"] || null,
      "x-admin-secret": headers["x-admin-secret"] || null,
      "x-admin": headers["x-admin"] || null
    },
    env: {
      ADMIN_SECRET_exists: !!process.env.ADMIN_SECRET,
      ADMIN_SECRET_preview: process.env.ADMIN_SECRET ? (String(process.env.ADMIN_SECRET).slice(0,6) + "...") : null
    }
  }, null, 2));
};
