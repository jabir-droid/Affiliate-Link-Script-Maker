<script>
/** ====== auth.js (client-side auth sederhana) ====== */

function setUserName(name) {
  localStorage.setItem('userName', String(name || '').trim());
}

function getUserName() {
  return localStorage.getItem('userName') || '';
}

function isLoggedIn() {
  return !!getUserName();
}

/** Pakai di halaman utama (index/generator) untuk blokir akses */
function requireLogin(redirectTo = 'login.html') {
  if (!isLoggedIn()) {
    window.location.replace(redirectTo);
  }
}

/** Pakai di login page untuk auto-skip jika sudah login */
function redirectIfLoggedIn(target = 'index.html') {
  if (isLoggedIn()) {
    window.location.replace(target);
  }
}

function logout(redirectTo = 'login.html') {
  localStorage.removeItem('userName');
  window.location.replace(redirectTo);
}
</script>
