// api/app.js
// Satu serverless function untuk SEMUA endpoint /api/*

/** ---------- Util JSON & body ---------- **/
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
  try {
    // Pastikan URL selalu bisa diparse saat running di Vercel
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;     // e.g. "/api/generate"
    const method = req.method || "GET";

    // --- CORS sederhana (opsional; aman bila kamu akses dari domain lain) ---
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key, x-admin-secret, x-admin");
    if (method === "OPTIONS") return send(res, 204, { ok: true });

    // ---------- Endpoint untuk tes rute ----------
    if (path === "/api/ping") {
      return send(res, 200, {
        ok: true,
        method,
        ts: Date.now(),
        note: "Jika ini muncul, rute /api/* sudah masuk ke api/app.js"
      });
    }

    // ---------- Endpoint generate ----------
    if (path === "/api/generate") {
      if (method !== "POST") return send(res, 405, { ok: false, message: "Method Not Allowed" });
      const b = await readBody(req);

      const linkProduk = String(b.linkProduk || b.link || "").trim();
      const topik      = String(b.topik || b.namaProduk || "").trim();
      const descArr    = Array.isArray(b.deskripsi) ? b.deskripsi
                        : Array.isArray(b.kelebihan) ? b.kelebihan
                        : [];

      // Validasi minimum sesuai permintaanmu (min 2 kelebihan)
      if (!linkProduk) return send(res, 400, { ok: false, message: "linkProduk wajib diisi" });
      if (!topik)      return send(res, 400, { ok: false, message: "Nama/Jenis Produk wajib diisi" });
      if (descArr.length < 2) return send(res, 400, { ok: false, message: "Minimal 2 kelebihan/keunggulan." });

      // Sementara: dummy hasil (untuk memastikan 404 hilang dulu).
      // Nanti gampang diganti ke Gemini di tempat ini.
      const scripts = [
        {
          title: `${topik} — Ringkas & Jelas`,
          content: `Sedang cari ${topik} yang worth it? ${descArr.join(", ")}. Cek selengkapnya di ${linkProduk} 👉`
        },
        {
          title: `${topik} untuk Aktivitas Sehari-hari`,
          content: `Butuh ${topik} yang nggak rewel? Keunggulannya: ${descArr.join(", ")}. Detailnya di ${linkProduk} 👍`
        }
      ];

      return send(res, 200, { ok: true, scripts });
    }

    // ---------- Endpoint admin minimal (opsional; boleh dihapus) ----------
    if (path === "/api/health") {
      return send(res, 200, { ok: true, env: "up", ts: Date.now() });
    }

    // ---------- Fallback: 404 ----------
    return send(res, 404, { ok: false, message: "Not Found", path });
  } catch (e) {
    return send(res, 500, { ok: false, message: String(e?.message || e) });
  }
};
