const Hospital = require('../models/Hospital');
const SuperAdmin = require('../models/SuperAdmin');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const generateToken = require('../utils/generateToken');
const generateResetCode = require('../utils/generateResetCode');
const { sendPasswordResetEmail } = require('../services/emailService');

// @desc    Login for Hospital and SuperAdmin
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Check Hospital Account
    const hospital = await Hospital.findOne({ email: cleanEmail });
    if (hospital) {
      const isMatch = await comparePassword(password, hospital.passwordHash || hospital.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.'
        });
      }

      // NEW — Sprint 2 approval gate
      if (hospital.verificationStatus === 'pending') {
        return res.status(401).json({
          success: false,
          error: 'Your account is still pending Super Admin approval.'
        });
      }
      if (hospital.verificationStatus === 'rejected') {
        return res.status(401).json({
          success: false,
          error: 'Your registration was not approved. Check your email for details.'
        });
      }

      // Check password
      const isMatch = await comparePassword(password, hospital.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Please verify your email before logging in.'
        });
      }

      if (hospital.verificationStatus === 'rejected') {
        return res.status(403).json({
          success: false,
          error: 'Your hospital registration has been rejected.'
        });
      }

      const token = generateToken({ id: hospital._id, role: 'hospital' });

      return res.status(200).json({
        success: true,
        token,
        role: 'hospital',
        user: {
          id: hospital._id.toString(),
          name: hospital.hospitalName || hospital.name,
          email: hospital.email
        }
      });
    }

    // 2. Check SuperAdmin Account
    const superAdmin = await SuperAdmin.findOne({ email: cleanEmail });
    if (superAdmin) {
      const isMatch = await comparePassword(password, superAdmin.passwordHash || superAdmin.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.'
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
          email: superAdmin.email
        }
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid email or password.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request password reset code (Hospital / SuperAdmin)
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const { code, expiresAt } = generateResetCode ? generateResetCode() : {
      code: '482913',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    };

    // 1. Check Hospital
    const hospital = await Hospital.findOne({ email: cleanEmail });
    if (hospital) {
      hospital.resetCode = code;
      hospital.resetCodeExpiresAt = expiresAt;
      await hospital.save();
      try {
        if (sendPasswordResetEmail) await sendPasswordResetEmail(cleanEmail, code);
      } catch (err) {}
    } else {
      // 2. Check SuperAdmin
      const superAdmin = await SuperAdmin.findOne({ email: cleanEmail });
      if (superAdmin) {
        superAdmin.resetCode = code;
        superAdmin.resetCodeExpiresAt = expiresAt;
        await superAdmin.save();
        try {
          if (sendPasswordResetEmail) await sendPasswordResetEmail(cleanEmail, code);
        } catch (err) {}
      }
    }

    // Anti-enumeration: always return generic 200 message
    return res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a reset code has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password with 6-digit code (Hospital / SuperAdmin)
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Email, code, and new password are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const newHashedPassword = await hashPassword(newPassword);

    // 1. Check Hospital
    const hospital = await Hospital.findOne({ email: cleanEmail });
    if (hospital && hospital.resetCode === code) {
      if (hospital.resetCodeExpiresAt && hospital.resetCodeExpiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset code.'
        });
      }

      hospital.passwordHash = newHashedPassword;
      hospital.resetCode = null;
      hospital.resetCodeExpiresAt = null;
      await hospital.save();

      return res.status(200).json({
        success: true,
        message: 'Password reset successful. You can now log in with your new password.'
      });
    }

    // 2. Check SuperAdmin
    const superAdmin = await SuperAdmin.findOne({ email: cleanEmail });
    if (superAdmin && superAdmin.resetCode === code) {
      if (superAdmin.resetCodeExpiresAt && superAdmin.resetCodeExpiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset code.'
        });
      }

      superAdmin.passwordHash = newHashedPassword;
      superAdmin.resetCode = null;
      superAdmin.resetCodeExpiresAt = null;
      await superAdmin.save();

      return res.status(200).json({
        success: true,
        message: 'Password reset successful. You can now log in with your new password.'
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid or expired reset code.'
    });
  } catch (error) {
    next(error);
  }
};