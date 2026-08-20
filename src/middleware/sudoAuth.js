const { comparePassword } = require('../utils/hashPassword');
const Hospital = require('../models/Hospital');
const Donor = require('../models/Donor');
const SuperAdmin = require('../models/SuperAdmin');
const AdminUser = require('../models/AdminUser');

async function requireSudoPassword(req, res, next) {
  try {
    const sudoPassword = req.body.sudoPassword || req.body.password || req.body.currentPassword;

    if (!sudoPassword) {
      return res.status(400).json({
        success: false,
        error: 'Password confirmation is required to perform this sensitive action.'
      });
    }

    let user = null;
    if (req.user.role === 'hospital') {
      user = await Hospital.findById(req.user.id);
    } else if (req.user.role === 'donor') {
      user = await Donor.findById(req.user.id);
    } else if (req.user.role === 'superadmin') {
      user = await SuperAdmin.findById(req.user.id);
    } else if (req.user.role === 'admin') {
      user = await AdminUser.findById(req.user.id);
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }

    const isValid = await comparePassword(sudoPassword, user.passwordHash || user.password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password. Action rejected.'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireSudoPassword;