// Backend/src/controllers/sharedAuthController.js
const Hospital = require('../models/Hospital');
const SuperAdmin = require('../models/SuperAdmin');
const Admin = require('../models/Admin');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const generateToken = require('../utils/generateToken');
const generateResetCode = require('../utils/generateResetCode');
const emailService = require('../services/emailService');
const sendPasswordResetEmail = (...args) => emailService.sendPasswordResetEmail(...args);

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Query all three user collections in parallel for optimal speed
    const [hospital, superAdmin, admin] = await Promise.all([
      Hospital.findOne({ email: cleanEmail, isDeleted: { $ne: true } }),
      SuperAdmin.findOne({ email: cleanEmail }),
      Admin.findOne({ email: cleanEmail, isDeleted: { $ne: true } })
    ]);

    // 1. Check Hospital Account
    if (hospital) {
      const isPasswordMatch = await comparePassword(password, hospital.passwordHash);
      if (!isPasswordMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.'
        });
      }

      if (!hospital.emailVerified) {
        return res.status(401).json({
          success: false,
          error: 'Please verify your email before logging in.'
        });
      }

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

      const token = generateToken({ id: hospital._id, role: 'hospital' });

      return res.status(200).json({
        success: true,
        token,
        role: 'hospital',
        user: {
          id: hospital._id.toString(),
          name: hospital.hospitalName,
          email: hospital.email
        }
      });
    }

    // 2. Check SuperAdmin Account
    if (superAdmin) {
      const isAdminPasswordMatch = await comparePassword(password, superAdmin.passwordHash);
      if (!isAdminPasswordMatch) {
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

    // 3. Check Admin Account
    if (admin) {
      if (!admin.emailVerified || !admin.passwordHash) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.'
        });
      }

      const isAdminMatch = await comparePassword(password, admin.passwordHash);
      if (!isAdminMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.'
        });
      }

      const token = generateToken({
        id: admin._id,
        role: 'admin',
        permissions: admin.permissions
      });

      return res.status(200).json({
        success: true,
        token,
        role: 'admin',
        permissions: admin.permissions,
        user: {
          id: admin._id.toString(),
          name: admin.name,
          centerName: admin.centerName || undefined,
          email: admin.email
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

exports.adminSetup = async (req, res, next) => {
  try {
    const {
      setupToken,
      token,
      centerName,
      phone,
      password,
      confirmPassword,
      location,
      termsAccepted,
      agreedToTerms
    } = req.body;

    const activeToken = setupToken || token;

    if (!activeToken || typeof activeToken !== 'string' || !activeToken.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired setup token.'
      });
    }

    const cleanToken = activeToken.trim();
    const admin = await Admin.findOne({
      setupToken: cleanToken,
      setupTokenExpiresAt: { $gt: new Date() },
      passwordHash: null,
      isDeleted: { $ne: true }
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired setup token.'
      });
    }

    if (
      !centerName ||
      typeof centerName !== 'string' ||
      centerName.trim().length < 2 ||
      centerName.trim().length > 120
    ) {
      return res.status(400).json({
        success: false,
        error: 'Blood Center name must be between 2 and 120 characters.'
      });
    }

    const PHONE_PATTERN = /^\+251\d{9}$/;
    if (!phone || typeof phone !== 'string' || !PHONE_PATTERN.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Phone must be in +251 format.'
      });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long.'
      });
    }

    if (confirmPassword !== undefined && confirmPassword !== password) {
      return res.status(400).json({
        success: false,
        error: 'Password confirmation does not match.'
      });
    }

    const isTermsAccepted = termsAccepted !== undefined ? termsAccepted : agreedToTerms;
    if (isTermsAccepted !== true) {
      return res.status(400).json({
        success: false,
        error: 'You must agree to the Terms of Service and Privacy Policy.'
      });
    }

    if (!location || typeof location !== 'object' || Array.isArray(location)) {
      return res.status(400).json({
        success: false,
        error: 'Location is required.'
      });
    }

    let lat, lng;
    if (
      (location.lat !== undefined || location.latitude !== undefined) &&
      (location.lng !== undefined || location.longitude !== undefined)
    ) {
      lat = location.lat !== undefined ? location.lat : location.latitude;
      lng = location.lng !== undefined ? location.lng : location.longitude;
    } else if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      lng = location.coordinates[0];
      lat = location.coordinates[1];
    } else {
      return res.status(400).json({
        success: false,
        error: 'Location must include valid coordinates or lat/lng.'
      });
    }

    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude must be valid finite numbers.'
      });
    }

    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        success: false,
        error: 'Latitude must be between -90 and 90 degrees.'
      });
    }

    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        error: 'Longitude must be between -180 and 180 degrees.'
      });
    }

    const cleanAddress = typeof location.address === 'string' ? location.address.trim() : '';
    if (!cleanAddress || cleanAddress.length < 3 || cleanAddress.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Address is required and must be between 3 and 200 characters.'
      });
    }

    admin.location = {
      type: 'Point',
      coordinates: [lng, lat],
      address: cleanAddress
    };

    // Persist profile and secure setup state
    admin.centerName = centerName.trim();
    admin.name = centerName.trim();
    admin.phone = phone.trim();
    admin.termsAccepted = true;
    admin.passwordHash = await hashPassword(password);
    admin.setupToken = null;
    admin.setupTokenExpiresAt = null;
    admin.verificationOtp = null;
    admin.verificationOtpExpiresAt = null;
    admin.emailVerified = true;

    await admin.save();

    return res.status(200).json({
      success: true,
      message: 'Blood Center registration completed successfully. You can now log in.',
      admin: {
        id: admin._id.toString(),
        name: admin.name,
        centerName: admin.centerName,
        email: admin.email,
        phone: admin.phone,
        permissions: admin.permissions,
        emailVerified: admin.emailVerified,
        termsAccepted: admin.termsAccepted,
        location: {
          lat: admin.location.coordinates[1],
          lng: admin.location.coordinates[0],
          address: admin.location.address
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.setupAdminPassword = exports.adminSetup;

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
    const { code, expiresAt } = generateResetCode();

    const [hospital, superAdmin, admin] = await Promise.all([
      Hospital.findOne({ email: cleanEmail }),
      SuperAdmin.findOne({ email: cleanEmail }),
      Admin.findOne({ email: cleanEmail })
    ]);

    if (hospital) {
      hospital.resetCode = code;
      hospital.resetCodeExpiresAt = expiresAt;
      await hospital.save();
      sendPasswordResetEmail(cleanEmail, code).catch((err) => {
        console.warn('[WARN] Background email dispatch error:', err.message);
      });
    } else if (superAdmin) {
      superAdmin.resetCode = code;
      superAdmin.resetCodeExpiresAt = expiresAt;
      await superAdmin.save();
      sendPasswordResetEmail(cleanEmail, code).catch((err) => {
        console.warn('[WARN] Background email dispatch error:', err.message);
      });
    } else if (admin) {
      if (admin.passwordHash) {
        admin.setupToken = code;
        admin.setupTokenExpiresAt = expiresAt;
        await admin.save();
        sendPasswordResetEmail(cleanEmail, code).catch((err) => {
          console.warn('[WARN] Background email dispatch error:', err.message);
        });
      }
    }

    return res.status(200).json({
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
      return res.status(400).json({
        success: false,
        error: 'Email, code, and new password are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const newHashedPassword = await hashPassword(newPassword);

    const hospital = await Hospital.findOne({ email: cleanEmail });
    if (hospital && hospital.resetCode === code.trim()) {
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

    const superAdmin = await SuperAdmin.findOne({ email: cleanEmail });
    if (superAdmin && superAdmin.resetCode === code.trim()) {
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

    const admin = await Admin.findOne({ email: cleanEmail });
    if (admin && admin.passwordHash && admin.setupToken === code.trim()) {
      if (admin.setupTokenExpiresAt && admin.setupTokenExpiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset code.'
        });
      }

      admin.passwordHash = newHashedPassword;
      admin.setupToken = null;
      admin.setupTokenExpiresAt = null;
      await admin.save();

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
