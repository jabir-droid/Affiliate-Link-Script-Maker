// config/quota.js
// Atur batas kuota global per hari & estimasi jumlah user yang akan pakai link.
// Front-end akan menampilkan "kuota per user" = floor(MAX_GLOBAL_PER_DAY / ESTIMATED_USERS)
module.exports = {
  MAX_GLOBAL_PER_DAY: 1000, // total permintaan/hari untuk semua user (bebas ubah)
  ESTIMATED_USERS: 100,     // estimasi jumlah user yang akan share link (bebas ubah)
};
