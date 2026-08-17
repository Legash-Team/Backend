module.exports = (allowedRole) => (req, res, next) => {
  if (!req.user || req.user.role !== allowedRole) {
    return res.status(403).json({ success: false, error: 'You do not have permission to access this.' });
  }
  next();
};
