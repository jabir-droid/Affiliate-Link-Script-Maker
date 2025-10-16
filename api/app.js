// api/app.js
import { Redis } from "@upstash/redis";
import cookie from "cookie";

// ==== ENV & helpers ====
const KV_URL = process.env.KV_REST_API_URL || process.env.AFFILIATE_SCRIPT_KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.AFFILIATE_SCRIPT_KV_REST_API_TOKEN;
const redis = KV_URL && KV_TOKEN ? new Redis({ url: KV_URL, token: KV_TOKEN }) : null;

const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const MAX_USERS = Number(process.env.MAX_USERS || 50);

// Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"; // ini yang kamu pakai

const USERS_SET = "aff:users";
const SESSION_PREFIX = "aff:sess:";
const COOKIE_NAME = "aff_sess";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari

const json = (res, code, data) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
};
const slugify = (s) =>
  String(s||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,60);

async function requireLogin(req, res) {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    const sid = cookies[COOKIE_NAME];
    if (!sid || !redis) return null;
    const key = SESSION_PREFIX + sid;
    const data = await redis.hgetall(key);
    if (!data || !data.name) return null;
    // refresh TTL
    await redis.expire(key, COOKIE_TTL_SECONDS);
    return { name: data.name, id: data.id };
  } catch {
    return null;
  }
}

async function setSession(res, name) {
  if (!redis) return;
  const sid = cryptoRandom();
  const key = SESSION_PREFIX + sid;
  await redis.hset(key, { id: slugify(name), name, ts: Date.now() });
  await redis.expire(key, COOKIE_TTL_SECONDS);
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(COOKIE_NAME, sid, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: COOKIE_TTL_SECONDS,
    })
  );
}
function clearSession(res){
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(COOKIE_NAME, "", { path:"/", maxAge:0 })
  );
}
function cryptoRandom(){
  // simple random id
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ==== Handlers ====

async function handleLogin(req, res){
  if (req.method !== "POST") return json(res, 405, { ok:false, message:"Method Not Allowed" });
  let body = {};
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch {}
  const name = String(body?.name || "").trim();
  if (!name) return json(res, 400, { ok:false, message:"Nama wajib diisi." });
  if (!redis) return json(res, 500, { ok:false, message:"Redis tidak terkonfigurasi." });

  const id = slugify(name);
  const exists = await redis.sismember(USERS_SET, id);
  if (!exists) return json(res, 403, { ok:false, message:"Nama tidak terdaftar. Hubungi admin." });

  await setSession(res, name);
  return json(res, 200, { ok:true, name });
}

async function handleMe(req, res){
  const me = await requireLogin(req, res);
  return json(res, 200, { ok:true, me: me || null });
}

async function handleLogout(req, res){
  clearSession(res);
  return json(res, 200, { ok:true });
}

async function handleQuota(req, res){
  if (!redis) return json(res, 200, { remaining: 1000 }); // fallback
  const key = `aff:global:used:${todayStr()}`;
  const used = Number((await redis.get(key)) || 0);
  const total = 1000;
  const remaining = Math.max(0, total - used);
  return json(res, 200, { remaining, used, total });
}

async function handleGenerate(req, res){
  if (req.method !== "POST") return json(res, 405, { ok:false, message:"Method Not Allowed" });

  // (opsional) wajib login
  const me = await requireLogin(req, res);
  if (!me) return json(res, 401, { ok:false, message:"Harus login." });

  let b={};
  try{
    const raw = await readBody(req); b = raw? JSON.parse(raw): {};
  }catch{}
  const userName = me.name; // ambil dari session
  const linkProduk = String(b.linkProduk || b.link || "").trim();
  const topik = String(b.topik || b.topic || "").trim();
  const deskripsi = Array.isArray(b.deskripsi) ? b.deskripsi :
                    Array.isArray(b.descriptions) ? b.descriptions : [];
  const gaya = String(b.gaya || b.style || "Gen Z");
  const panjang = String(b.panjang || b.length || "Sedang");
  const jumlah = Math.max(1, Math.min(8, Number(b.jumlah || b.count || b.generateCount || 1)));

  if (!linkProduk) return json(res, 400, { ok:false, message:"linkProduk wajib diisi." });
  if (!topik) return json(res, 400, { ok:false, message:"Nama/Jenis Produk wajib diisi." });
  if (!deskripsi || deskripsi.length < 1) return json(res, 400, { ok:false, message:"Minimal 1 kelebihan/keunggulan." });

  const prompt = `
Tulis ${jumlah} variasi skrip promosi afiliasi dalam bahasa Indonesia.
Produk: ${topik}
Kelebihan: ${deskripsi.join(", ")}
Link: ${linkProduk}
Gaya: ${gaya}
Panjang: ${panjang}

Format keluaran HARUS JSON valid, tanpa teks lain:
{
  "scripts": [
    { "title": "Judul Variasi 1", "content": "Isi copy 1 (multi-paragraf boleh)" }
  ]
}
`.trim();

  let scripts = null;
  try{
    if (!GEMINI_API_KEY){
      // fallback dev
      scripts = Array.from({ length: jumlah }).map((_,i)=>({
        title: `${topik}`,
        content: `✨💡 ${topik} — contoh (${i+1})\n\n${deskripsi.join(" • ")}\n\n${linkProduk}`
      }));
    }else{
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;
      const payload = {
        contents: [{ role:"user", parts:[{ text: prompt }] }],
        generationConfig: { temperature: 0.9, topP: 0.9 }
      };
      const r = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok){
        const t = await r.text();
        throw new Error(`Gemini error (${r.status}): ${t}`);
      }
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.map(p=>p?.text).join("") ||
                   j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let parsed;
      try{ parsed = JSON.parse(text); }
      catch{
        parsed = JSON.parse(String(text).replace(/```json|```/g,"").trim());
      }
      if (!parsed || !Array.isArray(parsed.scripts)) throw new Error("Format balikan model tidak sesuai (tanpa 'scripts').");
      scripts = parsed.scripts.map(s => ({ title: s.title || topik, content: s.content || "" }));
    }
  }catch(e){
    return json(res, 500, { ok:false, message: String(e?.message || e) });
  }

  // catat penggunaan
  if (redis){
    try{
      await redis.incr(`aff:global:used:${todayStr()}`);
      await redis.incr(`aff:user:used:${todayStr()}:${slugify(userName)}`);
      await redis.hset(`aff:user:meta:${slugify(userName)}`, { name: userName, updatedAt: Date.now() });
      await redis.sadd(USERS_SET, slugify(userName)); // keep exist
    }catch{}
  }

  return json(res, 200, { ok:true, modelUsed: GEMINI_MODEL, scripts });
}

// Admin: GET list, POST add, DELETE remove (query ?name=)
async function handleAdminUsers(req, res){
  const key = req.headers["x-admin-key"];
  if (!ADMIN_SECRET || key !== ADMIN_SECRET) return json(res, 401, { ok:false, message:"Unauthorized" });
  if (!redis) return json(res, 500, { ok:false, message:"Redis tidak terkonfigurasi." });

  if (req.method === "GET"){
    const members = await redis.smembers(USERS_SET);
    return json(res, 200, { ok:true, users: members });
  }
  if (req.method === "POST"){
    let body={}; try{ body = JSON.parse(await readBody(req) || "{}"); }catch{}
    const name = String(body.name || "").trim();
    if (!name) return json(res, 400, { ok:false, message:"name wajib" });
    await redis.sadd(USERS_SET, slugify(name));
    return json(res, 200, { ok:true, added: name });
  }
  if (req.method === "DELETE"){
    const url = new URL(req.url, "http://x");
    const name = String(url.searchParams.get("name") || "").trim();
    if (!name) return json(res, 400, { ok:false, message:"name wajib" });
    await redis.srem(USERS_SET, slugify(name));
    return json(res, 200, { ok:true, removed: name });
  }
  return json(res, 405, { ok:false, message:"Method Not Allowed" });
}

// Body reader
function readBody(req){
  return new Promise((resolve, reject)=>{
    let data=""; req.on("data", chunk=> data += chunk); req.on("end", ()=> resolve(data)); req.on("error", reject);
  });
}

// ==== Main router ====
export default async function handler(req, res){
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  try{
    if (p === "/api/login-name") return await handleLogin(req,res);
    if (p === "/api/me") return await handleMe(req,res);
    if (p === "/api/logout") return await handleLogout(req,res);
    if (p === "/api/quota") return await handleQuota(req,res);
    if (p === "/api/generate") return await handleGenerate(req,res);
    if (p === "/api/admin/users") return await handleAdminUsers(req,res);

    return json(res, 404, { ok:false, message:"Not Found" });
  }catch(e){
    return json(res, 500, { ok:false, message:String(e?.message || e) });
  }
}
