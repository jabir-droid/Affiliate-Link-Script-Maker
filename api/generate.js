// api/generate.js
function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return send(res, 204, { ok: true });
  if (req.method !== "POST") return send(res, 405, { ok: false, message: "Method Not Allowed" });

  const body = await readBody(req);
  const link = String(body.linkProduk || "").trim();
  const topik = String(body.topik || "").trim();
  const deskripsi = Array.isArray(body.deskripsi) ? body.deskripsi : [];

  if (!link) return send(res, 400, { ok: false, message: "linkProduk wajib diisi" });
  if (!topik) return send(res, 400, { ok: false, message: "Nama/Jenis Produk wajib diisi" });
  if (deskripsi.length < 2) return send(res, 400, { ok: false, message: "Minimal 2 kelebihan/keunggulan." });

  // --- Dummy result sementara ---
  const scripts = [];
  for (let i = 1; i <= Math.min(Number(body.jumlah || 3), 10); i++) {
    scripts.push({
      title: `${topik} — Variasi ${i}`,
      content: `✨ ${topik} dengan fitur ${deskripsi.join(", ")}.\nTemukan selengkapnya di ${link} 🔗`
    });
  }

  return send(res, 200, { ok: true, scripts });
};
