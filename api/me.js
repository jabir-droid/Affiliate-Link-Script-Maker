// api/me.js
import { json, getCookie, SESSION_COOKIE } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { ok: false });

  const raw = getCookie(req, SESSION_COOKIE) || "";
  const name = String(raw).trim().toLowerCase();

  return json(res, 200, { ok: !!name, name: name || null });
}
