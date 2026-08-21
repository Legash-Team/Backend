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

    // Check if permission is present directly on req.user (e.g. from decoded token)
    if (req.user.permissions && req.user.permissions[permissionName] === true) {
      return next();
    }

    // Fallback to database check for fresh permissions
    const admin = await Admin.findById(req.user.id || req.user._id);
    if (!admin || !admin.permissions || !admin.permissions[permissionName]) {
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
