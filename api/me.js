// /api/me.js
import { json, setCors, requireSession } from "./_utils.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return json(res, 405, { ok: false, message: "Method Not Allowed" });

  const sess = await requireSession(req);
  if (!sess) return json(res, 401, { ok: false, user: null });

  return json(res, 200, { ok: true, user: sess.user });
}
