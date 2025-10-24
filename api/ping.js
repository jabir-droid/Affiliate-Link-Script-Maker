module.exports = async (req, res) => {
  res.status(200).json({ ok: true, ts: Date.now(), method: req.method, ua: req.headers['user-agent'] || '' });
};
