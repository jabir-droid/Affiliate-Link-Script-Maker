// api/app.js
const { URL } = require("url");

/* ========== helpers ========== */
function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

/* ========== main handler ========== */
module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    // Health
    if (p === "/api/ping") {
      return json(res, 200, { ok: true, ts: Date.now(), method: req.method });
    }

    // -------- /api/generate --------
    if (p === "/api/generate") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return json(res, 405, { ok: false, message: "Method Not Allowed" });
      }

      // parse JSON body
      let body = {};
      try {
        body = JSON.parse((await readBody(req)) || "{}");
      } catch {
        return json(res, 400, { ok: false, message: "Invalid JSON body" });
      }

      const linkProduk = String(body.linkProduk || body.link || "").trim();
      const topik = String(body.topik || body.topic || "").trim();
      const deskripsi = Array.isArray(body.deskripsi) ? body.deskripsi : [];

      if (!linkProduk) return json(res, 400, { ok: false, message: "linkProduk wajib diisi" });
      if (!topik) return json(res, 400, { ok: false, message: "Nama/Jenis Produk wajib diisi" });
      if (deskripsi.length < 1) return json(res, 400, { ok: false, message: "Minimal 1 kelebihan/keunggulan" });

      const jumlah = Math.max(1, Math.min(8, Number(body.jumlah || 3)));

      // TODO: Jika ingin pakai Gemini, ganti bagian "scripts" ini dengan hasil model.
      const scripts = Array.from({ length: jumlah }).map((_, i) => ({
        title: `${topik} — Varian ${i + 1}`,
        content:
          `Butuh solusi hemat tapi andal? ${topik} hadir dengan ${deskripsi.join(", ")}.\n` +
          `Cek di sini: ${linkProduk} 👉`
      }));

      return json(res, 200, { ok: true, scripts });
    }

    // 404 fallback
    return json(res, 404, { ok: false, message: "Not Found" });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
