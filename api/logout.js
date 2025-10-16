// api/logout.js
export default async function handler(req, res) {
  res.setHeader("Set-Cookie", `aff_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax; ${process.env.VERCEL ? "Secure;" : ""}`);
  res.json({ ok: true });
}
