// api/me.js
import { redisClient, verify, getCookie } from "./_utils";

export default async function handler(req, res) {
  const redis = redisClient();
  const token = getCookie(req, "aff_token");
  if (!token || !redis) return res.json({ ok: false });

  const data = verify(token);
  if (!data?.id) return res.json({ ok: false });

  const allowed = await redis.sismember("aff:allow", data.id);
  if (!allowed) return res.json({ ok: false });

  return res.json({ ok: true, id: data.id });
}
