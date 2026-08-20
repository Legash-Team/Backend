// Backend/src/middleware/requirePermission.js

/**
 * Scoped Permission Middleware Factory
 * - If req.user.role === 'superadmin', bypasses all permission checks and invokes next().
 * - If req.user.role === 'admin', verifies that req.user.permissions?.[permission] === true.
 * - Otherwise, returns 403 Forbidden with standard error payload.
 *
 * @param {string} permission - 'canApproveHospitals' | 'canPostEvents'
 */
module.exports = function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthenticated.' });
    }

    // Super Admin bypasses all scoped checks
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Admin role verification against scoped capability flags
    if (req.user.role === 'admin') {
      if (req.user.permissions && req.user.permissions[permission] === true) {
        return next();
      }
      return res.status(403).json({
        success: false,
        error: `Forbidden: Missing required permission (${permission}).`,
      });
    }

    return res.status(403).json({
      success: false,
      error: 'You do not have permission to access this resource.',
    });
  };
};