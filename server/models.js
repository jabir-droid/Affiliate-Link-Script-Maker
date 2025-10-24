// api/models.js
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY kosong" });

    const resp = await fetch("https://generativelanguage.googleapis.com/v1/models", {
      headers: { "x-goog-api-key": apiKey }
    });
    const text = await resp.text();
    if (!resp.ok) return res.status(resp.status).json({ error: "list models error", detail: text });

    const data = JSON.parse(text);
    // kirim nama model saja biar mudah dibaca
    res.status(200).json({ models: (data.models || []).map(m => m.name) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
