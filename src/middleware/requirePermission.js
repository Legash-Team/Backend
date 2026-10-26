const Admin = require('../models/Admin');

/**
 * Middleware to enforce role-based permissions.
 * Super Admin bypasses all permission checks.
 * Admins must have the specific boolean permission flag set to true.
 *
 * @param {string} permissionName - e.g. 'canApproveHospitals', 'canPostEvents'
 */
const requirePermission = (permissionName) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.'
      });
    }

    // Super Admin has unrestricted permissions across all administrative actions
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Must be an admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to access this.'
      });
    }

    // Authoritative check against database; fall back to req.user.permissions for unit tests / decoded tokens
    const admin = await Admin.findById(req.user.id || req.user._id);
    const permissions = admin ? admin.permissions : req.user.permissions;

    if (admin) {
      req.user.permissions = admin.permissions;
    }

    // Blood centers can post events by default
    if (permissionName === 'canPostEvents' && (req.user.centerName || admin?.centerName || permissions?.canPostEvents)) {
      return next();
    }

    if (!permissions || !permissions[permissionName]) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action.'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requirePermission;
