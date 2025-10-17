// api/me.js
import { json, getCookie } from "./_utils";

export default async function handler(req, res) {
  const name = getCookie(req, "aff_name") || "";
  return json(res, 200, { ok: true, name });
}
