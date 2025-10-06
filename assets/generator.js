// assets/generator.js
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const qGlobal = $("#qGlobal");
const qUser = $("#qUser");
const qBar = $("#qBar");
const btnRefresh = $("#refreshQuota");

const descList = $("#descList");
const btnAddDesc = $("#btnAddDesc");
const form = $("#genForm");
const statusEl = $("#status");
const resultWrap = $("#resultWrap");
const resultsEl = $("#results");

// buat minimal 2 kolom deskripsi
function addDescInput(value = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = `Deskripsi singkat…`;
  input.value = value;
  descList.appendChild(input);
}
addDescInput("");
addDescInput("");

btnAddDesc.addEventListener("click", () => addDescInput(""));

// Ambil kuota dari API
async function loadQuota() {
  try {
    btnRefresh.disabled = true;
    const r = await fetch("/api/quota");
    const j = await r.json();

    if (!j.ok) throw new Error("Gagal load kuota");
    qGlobal.textContent = j.globalQuota.toLocaleString("id-ID");
    qUser.textContent = j.perUser.toLocaleString("id-ID");

    const pct = Math.max(0.02, Math.min(1, j.perUser / j.globalQuota));
    qBar.style.width = (pct * 100).toFixed(1) + "%";
  } catch (e) {
    qGlobal.textContent = "—";
    qUser.textContent = "—";
    qBar.style.width = "0%";
  } finally {
    btnRefresh.disabled = false;
  }
}
btnRefresh.addEventListener("click", loadQuota);
loadQuota();

// Submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "";

  const link = $("#link").value.trim();
  const mainPoint = $("#mainPoint").value.trim();
  const style = $("#style").value;
  const length = $("#length").value;
  const variations = Number($("#variations").value || 3);

  const descriptions = [...descList.querySelectorAll("input")]
    .map((i) => i.value.trim())
    .filter(Boolean);

  if (!link || !mainPoint || descriptions.length < 2) {
    statusEl.textContent = "Harap isi Link, Poin Utama, dan minimal 2 deskripsi.";
    return;
  }

  try {
    statusEl.textContent = "Memproses…";
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link, mainPoint, descriptions, style, length, variations }),
    });

    const j = await r.json();
    if (!r.ok) {
      throw new Error(j?.detail || j?.error || "Gagal generate");
    }

    const scripts = j.result?.scripts || [];
    resultsEl.innerHTML = "";
    if (!scripts.length) {
      resultsEl.innerHTML = `<div class="result-card">Tidak ada hasil.</div>`;
    } else {
      resultWrap.style.display = "block";
      scripts.forEach((s, idx) => {
        const card = document.createElement("div");
        card.className = "result-card";
        card.innerHTML = `
          <div class="result-title">Variasi ${idx + 1} • ${escapeHtml(s.title || "Tanpa judul")}</div>
          <div class="result-body" id="res-${idx}">${escapeHtml(s.content || "")}</div>
          <div class="result-actions">
            <button class="btn ghost" data-copy="${idx}">Salin</button>
          </div>
        `;
        resultsEl.appendChild(card);
      });

      // bind salin
      resultsEl.addEventListener("click", (ev) => {
        const btn = ev.target.closest("button[data-copy]");
        if (!btn) return;
        const id = btn.getAttribute("data-copy");
        const txt = $(`#res-${id}`).textContent;
        navigator.clipboard.writeText(txt).then(() => {
          btn.textContent = "Tersalin!";
          setTimeout(() => (btn.textContent = "Salin"), 1500);
        });
      }, { once: true });
    }
    statusEl.textContent = "";
  } catch (e) {
    statusEl.textContent = "Terjadi masalah: " + e.message;
  }
});

function escapeHtml(str){
  return String(str || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
