// api/_echo.js
const { j, getAdminHeader, getAdminEnv } = require("./_utils");
module.exports = async (req, res) => {
  j(res, 200, {
    ok: true,
    method: req.method,
    // header yang dikirim klien (hanya sebagian penting)
    got_header: {
      "x-admin-key": req.headers["x-admin-key"] || null,
      "x-admin-secret": req.headers["x-admin-secret"] || null,
      "x-admin": req.headers["x-admin"] || null
    },
    // apakah sama dengan env (true/false saja, tanpa menulis isi env)
    env_present: !!getAdminEnv()
  });
};
