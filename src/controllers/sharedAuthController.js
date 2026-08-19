const _crypto = require('crypto');
const Hospital = require('../models/Hospital');
const SuperAdmin = require('../models/SuperAdmin');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const generateToken = require('../utils/generateToken');
const { sendPasswordResetEmail } = require('../services/emailService');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const lowerEmail = email.toLowerCase().trim();

    // 1. Check Hospital collection first
    const hospital = await Hospital.findOne({ email: lowerEmail });

    if (hospital) {
      // Check if email is verified
      const isVerified = hospital.emailVerified;
      if (!isVerified) {
        return res.status(401).json({
          success: false,
          error: 'Please verify your email before logging in.'
        });
      }

      // Check password
      const isMatch = await comparePassword(password, hospital.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.'
        });
      }

      // Generate token
      const token = generateToken({ id: hospital._id, role: 'hospital' });

      return res.status(200).json({
        success: true,
        token,
        role: 'hospital',
        user: {
          id: hospital._id,
          name: hospital.hospitalName,
          email: hospital.email
        }
      });
    }

    // 2. Check SuperAdmin collection
    const superAdmin = await SuperAdmin.findOne({ email: lowerEmail });

    if (superAdmin) {
      const isMatch = await comparePassword(password, superAdmin.passwordHash);
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
          id: superAdmin._id,
          name: superAdmin.name,
          email: superAdmin.email
        }
      });
    }

    // 3. No account found with that email
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password.'
    });

  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    const lowerEmail = email.toLowerCase().trim();

    // Look for Hospital or SuperAdmin
    let user = await Hospital.findOne({ email: lowerEmail });
    let model = Hospital;

    if (!user) {
      user = await SuperAdmin.findOne({ email: lowerEmail });
      model = SuperAdmin;
    }

    if (user) {
      // Generate 6-digit numeric code
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const resetCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      await model.updateOne({ _id: user._id }, { resetCode, resetCodeExpiresAt });

      try {
        if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('example')) {
          console.log(`\n📧 [EMAIL MOCK] Reset code for ${user.email}: ${resetCode}\n`);
        } else {
          await sendPasswordResetEmail(user.email, resetCode);
          console.log(`✅ Password reset code sent to ${user.email}`);
        }
      } catch (emailErr) {
        console.warn('⚠️ SMTP Error - falling back to console log:');
        console.log(`👉 Reset code: ${resetCode}`);
      }
    }

    res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a reset code has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, code, and new password are required.' });
    }

    const lowerEmail = email.toLowerCase().trim();

    // Look for Hospital or SuperAdmin
    let user = await Hospital.findOne({ email: lowerEmail });
    let model = Hospital;

    if (!user) {
      user = await SuperAdmin.findOne({ email: lowerEmail });
      model = SuperAdmin;
    }

    if (!user || user.resetCode !== code || !user.resetCodeExpiresAt || user.resetCodeExpiresAt < new Date()) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset code.' });
    }

    const passwordHash = await hashPassword(newPassword);

    await model.updateOne(
      { _id: user._id },
      { passwordHash, resetCode: null, resetCodeExpiresAt: null }
    );

    res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.'
    });
  } catch (error) {
    next(error);
  }
};