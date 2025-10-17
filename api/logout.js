// api/logout.js
import { json, clearCookie } from "./_utils";

export default async function handler(req, res) {
  clearCookie(res, "aff_name");
  return json(res, 200, { ok: true });
}
