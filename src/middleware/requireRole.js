module.exports = (allowedRoles) => (req, res, next) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'You do not have permission to access this.' });
  }
  next();
};
