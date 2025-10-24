const { Redis } = require("@upstash/redis");
module.exports = async (req, res) => {
  try {
    const adminSecret = !!process.env.ADMIN_SECRET;
    const kvUrl   = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
    const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
    let kvReachable = false;
    try {
      if (kvUrl && kvToken) {
        const r = new Redis({ url: kvUrl, token: kvToken });
        await r.ping();
        kvReachable = true;
      }
    } catch(_) {}

    res.status(200).json({
      ok: true,
      adminSecret,
      kvUrl: !!kvUrl,
      kvToken: !!kvToken,
      kvReachable
    });
  } catch (e) {
    res.status(500).json({ ok:false, message:String(e?.message||e) });
  }
};
