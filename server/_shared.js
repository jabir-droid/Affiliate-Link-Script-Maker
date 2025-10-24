// /api/_shared.js

export function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * Validasi origin terhadap allow-list (ENV: ALLOWED_ORIGIN)
 * - Return: origin yang lolos (string) atau "" jika proteksi dimatikan (ENV kosong)
 * - Throw 403 jika tidak diizinkan
 */
export function assertAllowedOrigin(req) {
  const allowEnv = process.env.ALLOWED_ORIGIN || "";
  const allowList = allowEnv
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (allowList.length === 0) return ""; // proteksi OFF

  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const found = allowList.find(
    d => (origin && origin.startsWith(d)) || (referer && referer.startsWith(d))
  );

  if (!found) {
    const e = new Error("Origin tidak diizinkan.");
    e.status = 403;
    throw e;
  }
  return found; // origin yg diizinkan
}

/** Set header CORS minimal agar fetch cross-origin lolos dari browser */
export function setCors(res, origin) {
  if (!origin) return; // kalau proteksi OFF, biasanya same-origin di Vercel
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/** Helper baca JSON body di Serverless Vercel (tanpa middleware tambahan) */
export async function readJson(req) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    const e = new Error("Body bukan JSON valid.");
    e.status = 400;
    throw e;
  }
}

/** Helper response JSON */
export function j(res, code, data) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
