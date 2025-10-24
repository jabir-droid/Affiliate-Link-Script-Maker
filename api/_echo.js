module.exports = async (req, res) => {
  res.status(200).json({
    ok: true,
    method: req.method,
    path: req.url,
    headers: req.headers,
  });
};
