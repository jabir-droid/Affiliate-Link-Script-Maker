<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
  <style>
    :root{
      --txt:#0f172a; --muted:#475569; --panel:#ffffff; --border:#e2e8f0;
      --blue:#12b3ff; --purple:#7b5cff;
    }
    html,body{height:100%}
    body{
      margin:0; color:var(--txt); font-family:Inter,system-ui,Segoe UI,Roboto,Arial;
      /* background beda dari index/generator */
      background:
        radial-gradient(800px 360px at 15% -10%, rgba(219,234,254,.9) 0%, transparent 60%),
        radial-gradient(900px 400px at 90% 0%, rgba(233,213,255,.88) 0%, transparent 60%),
        linear-gradient(180deg,#f8fbff, #eef2ff);
    }

    /* Kartu login ramping */
    .card{ background:var(--panel); border:1px solid var(--border); border-radius:18px;
           box-shadow:0 18px 40px rgba(15,23,42,.08); }

    .title-grad{background:linear-gradient(90deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent}
    .title-size{font-size:clamp(28px,5.5vw,40px); line-height:1.08}

    .inp{width:100%;border:1px solid var(--border);background:#f9fbff;padding:14px 16px;border-radius:14px;color:var(--txt);outline:none}
    .inp:focus{border-color:#4ea8ff;box-shadow:0 0 0 3px rgba(78,168,255,.18)}

    /* Efek sentuhan konsisten */
    .touch-card { transition: transform .18s ease, box-shadow .18s ease; }
    .touch-card:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(15,23,42,.15); }
    .touch-card:active { transform: translateY(-1px) scale(.997); }

    .touch-btn { transition: transform .14s ease, box-shadow .14s ease, opacity .14s ease; }
    .touch-btn:hover { box-shadow: 0 14px 36px rgba(123,92,255,.28); }
    .touch-btn:active { transform: translateY(1px) scale(.99); }

    .back-btn { border:1px solid var(--border); background:#ffffffd9; }
  </style>
</head>
<body>
  <div class="max-w-6xl mx-auto px-5 sm:px-6 py-6">
    <!-- tombol kembali atas -->
    <button onclick="history.back()" class="back-btn touch-btn grid place-items-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl">
      ←
    </button>

    <!-- header -->
    <section class="text-center mt-6">
      <h1 class="title-grad title-size font-extrabold">Login</h1>
      <p class="text-slate-600 mt-2">Masukkan data sesuai pembelian untuk melanjutkan.</p>
    </section>

    <!-- form card -->
    <section class="max-w-md mx-auto mt-6 p-5 sm:p-6 card touch-card">
      <form id="loginForm" class="grid gap-5">
        <div>
          <label for="name" class="block mb-2 text-slate-600 font-semibold">Nama Pembeli</label>
          <input id="name" type="text" class="inp" placeholder="Masukkan Nama yang Didaftarkan Saat Membeli." autocomplete="name">
        </div>

        <div>
          <label for="phone" class="block mb-2 text-slate-600 font-semibold">Nomor Handphone</label>
          <input id="phone" type="tel" inputmode="numeric" pattern="[0-9]*" class="inp"
                 placeholder="Contoh: 081234567890 (sesuai saat membeli)" autocomplete="tel">
        </div>

        <button id="submitBtn" type="submit"
                class="touch-btn w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-base font-extrabold"
                style="background:linear-gradient(90deg,var(--blue),var(--purple)); color:#fff;">
          Masuk
        </button>

        <p id="err" class="text-rose-600 text-sm"></p>
      </form>
    </section>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const btn  = document.getElementById('submitBtn');
    const err  = document.getElementById('err');

    function clean(s){ return String(s||'').trim(); }

    function validPhone(p){
      const digits = (p||'').replace(/\D/g,'');
      return digits.length >= 10 && digits.length <= 15;
    }

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      err.textContent = '';

      const name  = clean(document.getElementById('name').value);
      const phone = clean(document.getElementById('phone').value);

      if(!name)  return err.textContent = 'Nama wajib diisi.';
      if(!validPhone(phone)) return err.textContent = 'Nomor HP tidak valid. Gunakan 10–15 digit angka.';

      const prev = btn.textContent;
      btn.disabled = true; btn.textContent = 'Memproses...';

      try{
        const r = await fetch('/api/login-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone })
        });
        const j = await r.json().catch(()=>null);
        if(!r.ok || !j?.ok){
          throw new Error(j?.message || 'Server error.');
        }
        // sukses -> ke generator
        location.href = '/generator.html';
      }catch(ex){
        err.textContent = ex.message || 'Server error.';
      }finally{
        btn.disabled = false; btn.textContent = prev;
      }
    });

    // Enter di input juga submit
    ['name','phone'].forEach(id=>{
      const el=document.getElementById(id);
      el.addEventListener('keydown', (ev)=>{ if(ev.key==='Enter'){ form.requestSubmit(); }});
    });
  </script>
</body>
</html>
