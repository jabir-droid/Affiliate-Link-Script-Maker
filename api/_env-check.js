// api/_env-check.js
module.exports = (req, res) => {
  try {
    const ok = {
      adminSecret: !!process.env.ADMIN_SECRET,
      kvUrl: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
      kvToken: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
    };
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, ...ok }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, message:String(e?.message||e) }));
  }
};
