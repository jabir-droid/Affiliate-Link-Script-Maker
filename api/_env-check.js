// api/_env-check.js
module.exports = (req, res) => {
  try {
    const hasAdmin = !!process.env.ADMIN_SECRET;
    const hasUrl   = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
    const hasTok   = !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);

    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      adminSecret: hasAdmin,
      kvUrl: hasUrl,
      kvToken: hasTok
    }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, message:String(e?.message||e) }));
  }
};
