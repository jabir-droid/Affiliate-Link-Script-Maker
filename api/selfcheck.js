// api/selfcheck.js
// Endpoint tes cepat untuk memastikan ENV & akses Gemini sudah OK

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export default async function handler(req, res) {
  // CORS (aman untuk dipanggil dari domain lain saat debug)
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, where: "method", msg: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, where: "env", msg: "GEMINI_API_KEY kosong" });
    }

    const model = "gemini-1.5-flash"; // boleh ganti: "gemini-1.5-flash-latest"
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;

    const prompt = "Balas persis: SELF CHECK OK";
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const text = await resp.text();

    if (!resp.ok) {
      return res.status(resp.status).json({
        ok: false,
        where: "api",
        status: resp.status,
        detail: text.slice(0, 1000),
      });
    }

    return res.status(200).json({
      ok: true,
      where: "api",
      result: text.slice(0, 400),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, where: "server", detail: String(e) });
  }
}
