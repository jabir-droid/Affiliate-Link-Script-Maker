// api/quota.js
const { MAX_GLOBAL_PER_DAY, ESTIMATED_USERS } = require('../config/quota');

module.exports = async (req, res) => {
  try {
    const perUser = Math.floor(MAX_GLOBAL_PER_DAY / Math.max(1, ESTIMATED_USERS));

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      ok: true,
      globalQuota: MAX_GLOBAL_PER_DAY,
      users: ESTIMATED_USERS,
      perUser,
      ts: Date.now()
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'QUOTA_READ_ERROR', detail: String(e) });
  }
};
