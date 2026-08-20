// Backend/src/controllers/sharedAuthController.js
const Hospital = require('../models/Hospital');
const SuperAdmin = require('../models/SuperAdmin');
const AdminUser = require('../models/AdminUser');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const generateToken = require('../utils/generateToken');
const generateResetCode = require('../utils/generateResetCode');
const { sendPasswordResetEmail } = require('../services/emailService');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Check Hospital Account
    const hospital = await Hospital.findOne({ email: cleanEmail, isDeleted: { $ne: true } });
    if (hospital) {
      const isPasswordMatch = await comparePassword(password, hospital.passwordHash);
      if (!isPasswordMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.',
        });
      }

      if (!hospital.emailVerified) {
        return res.status(401).json({
          success: false,
          error: 'Please verify your email before logging in.',
        });
      }

      if (hospital.verificationStatus === 'pending') {
        return res.status(401).json({
          success: false,
          error: 'Your account is still pending Super Admin approval.',
        });
      }

      if (hospital.verificationStatus === 'rejected') {
        return res.status(401).json({
          success: false,
          error: 'Your registration was not approved. Check your email for details.',
        });
      }

      const token = generateToken({ id: hospital._id, role: 'hospital' });

      return res.status(200).json({
        success: true,
        token,
        role: 'hospital',
        user: {
          id: hospital._id.toString(),
          name: hospital.hospitalName,
          email: hospital.email,
        },
      });
    }

    // 2. Check SuperAdmin Account
    const superAdmin = await SuperAdmin.findOne({ email: cleanEmail });
    if (superAdmin) {
      const isAdminPasswordMatch = await comparePassword(password, superAdmin.passwordHash);
      if (!isAdminPasswordMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.',
        });
      }

      const token = generateToken({ id: superAdmin._id, role: 'superadmin' });

      return res.status(200).json({
        success: true,
        token,
        role: 'superadmin',
        user: {
          id: superAdmin._id.toString(),
          name: superAdmin.name,
          email: superAdmin.email,
        },
      });
    }

    // 3. Check Sub-Admin Account (AdminUser)
    const adminUser = await AdminUser.findOne({ email: cleanEmail, isDeleted: { $ne: true } });
    if (adminUser && adminUser.isActive && adminUser.passwordHash) {
      const isSubAdminPasswordMatch = await comparePassword(password, adminUser.passwordHash);
      if (!isSubAdminPasswordMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.',
        });
      }

      const token = generateToken({ id: adminUser._id, role: 'admin', permissions: adminUser.permissions });

      return res.status(200).json({
        success: true,
        token,
        role: 'admin',
        permissions: adminUser.permissions,
        user: {
          id: adminUser._id.toString(),
          name: adminUser.name,
          email: adminUser.email,
        },
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid email or password.',
    });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const { code, expiresAt } = generateResetCode();

    const hospital = await Hospital.findOne({ email: cleanEmail });
    if (hospital) {
      hospital.resetCode = code;
      hospital.resetCodeExpiresAt = expiresAt;
      await hospital.save();
      try {
        await sendPasswordResetEmail(cleanEmail, code);
      } catch (err) {}
    } else {
      const superAdmin = await SuperAdmin.findOne({ email: cleanEmail });
      if (superAdmin) {
        superAdmin.resetCode = code;
        superAdmin.resetCodeExpiresAt = expiresAt;
        await superAdmin.save();
        try {
          await sendPasswordResetEmail(cleanEmail, code);
        } catch (err) {}
      }
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a reset code has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Email, code, and new password are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const newHashedPassword = await hashPassword(newPassword);

    const hospital = await Hospital.findOne({ email: cleanEmail });
    if (hospital && hospital.resetCode === code.trim()) {
      if (hospital.resetCodeExpiresAt && hospital.resetCodeExpiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset code.',
        });
      }

      hospital.passwordHash = newHashedPassword;
      hospital.resetCode = null;
      hospital.resetCodeExpiresAt = null;
      await hospital.save();

      return res.status(200).json({
        success: true,
        message: 'Password reset successful. You can now log in with your new password.',
      });
    }

    const superAdmin = await SuperAdmin.findOne({ email: cleanEmail });
    if (superAdmin && superAdmin.resetCode === code.trim()) {
      if (superAdmin.resetCodeExpiresAt && superAdmin.resetCodeExpiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset code.',
        });
      }

      superAdmin.passwordHash = newHashedPassword;
      superAdmin.resetCode = null;
      superAdmin.resetCodeExpiresAt = null;
      await superAdmin.save();

      return res.status(200).json({
        success: true,
        message: 'Password reset successful. You can now log in with your new password.',
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid or expired reset code.',
    });
  } catch (error) {
    next(error);
  }
};