// api/app.js
const { URL } = require("url");

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

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    if (p === "/api/ping") return json(res, 200, { ok: true, method: req.method, ts: Date.now() });

    if (p === "/api/generate") {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return json(res, 405, { ok: false, message: "Method Not Allowed" });
      }

      let b = {};
      try { b = JSON.parse((await readBody(req)) || "{}"); } catch { return json(res, 400, { ok: false, message: "Invalid JSON" }); }

      const linkProduk = String(b.linkProduk || "").trim();
      const topik = String(b.topik || "").trim();
      const deskripsi = Array.isArray(b.deskripsi) ? b.deskripsi : [];
      const jumlah = Math.max(1, Math.min(8, Number(b.jumlah || 3)));

      if (!linkProduk) return json(res, 400, { ok: false, message: "linkProduk wajib diisi" });
      if (!topik) return json(res, 400, { ok: false, message: "Nama/Jenis Produk wajib diisi" });
      if (deskripsi.length < 1) return json(res, 400, { ok: false, message: "Minimal 1 kelebihan/keunggulan" });

      const scripts = Array.from({ length: jumlah }).map((_, i) => ({
        title: `${topik} — Varian ${i + 1}`,
        content: `Butuh solusi hemat tapi andal? ${topik} hadir dengan ${deskripsi.join(", ")}.\nCek di sini: ${linkProduk} 👉`
      }));
      return json(res, 200, { ok: true, scripts });
    }

    return json(res, 404, { ok: false, message: "Not Found" });
  } catch (e) {
    return json(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
