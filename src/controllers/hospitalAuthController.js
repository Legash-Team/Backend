// Backend/src/controllers/hospitalAuthController.js
const Hospital = require('../models/Hospital');
const { hashPassword } = require('../utils/hashPassword');
const { sendVerificationEmail } = require('../services/emailService');
const generateResetCode = require('../utils/generateResetCode');

const RESEND_COOLDOWN_SECONDS = 60;

exports.registerHospital = async (req, res, next) => {
  try {
    const { hospitalName, name, email, password, phone, licenseNumber, location, agreedToTerms } = req.body;
    const finalName = hospitalName || name;
    const cleanEmail = email ? email.toLowerCase().trim() : '';
    const cleanPhone = phone ? phone.trim() : '';
    const cleanLicense = licenseNumber ? licenseNumber.trim() : '';

    const existingHospital = await Hospital.findOne({
      $or: [
        { email: cleanEmail },
        { phone: cleanPhone },
        { licenseNumber: cleanLicense },
      ],
    });

    let coordinates = [38.75, 9.03];
    if (location) {
      if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        coordinates = location.coordinates;
      } else if (typeof location.lat === 'number' && typeof location.lng === 'number') {
        coordinates = [location.lng, location.lat];
      }
    }

    const hashedPassword = await hashPassword(password);
    const { code, expiresAt } = generateResetCode();

    if (existingHospital) {
      // If the hospital is not yet email-verified, allow updating and re-sending OTP
      if (existingHospital.email === cleanEmail && !existingHospital.emailVerified) {
        existingHospital.hospitalName = finalName.trim();
        existingHospital.passwordHash = hashedPassword;
        existingHospital.phone = cleanPhone;
        existingHospital.licenseNumber = cleanLicense;
        existingHospital.location = {
          type: 'Point',
          coordinates,
          address: location?.address || 'Addis Ababa, Ethiopia',
        };
        existingHospital.verificationOtp = code;
        existingHospital.verificationOtpExpiresAt = expiresAt;
        existingHospital.verificationOtpLastSentAt = new Date();

        await existingHospital.save();

        // Dispatch email asynchronously in background
        sendVerificationEmail(existingHospital.email, code).catch((err) => {
          console.warn('[WARN] Background email dispatch error:', err.message);
        });

        return res.status(200).json({
          success: true,
          message: 'Account updated. Verification code sent to your email.',
          hospitalId: existingHospital._id.toString(),
          requiresVerification: true,
        });
      }

      if (existingHospital.email === cleanEmail) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this email is already registered.',
        });
      }
      if (existingHospital.phone === cleanPhone) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this phone number is already registered.',
        });
      }
      if (existingHospital.licenseNumber === cleanLicense) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this license number is already registered.',
        });
      }
    }

    const hospital = new Hospital({
      hospitalName: finalName.trim(),
      email: cleanEmail,
      passwordHash: hashedPassword,
      phone: cleanPhone,
      licenseNumber: cleanLicense,
      location: {
        type: 'Point',
        coordinates,
        address: location?.address || 'Addis Ababa, Ethiopia',
      },
      agreedToTerms: agreedToTerms !== undefined ? agreedToTerms : true,
      emailVerified: false,
      verificationStatus: 'pending',
      verificationOtp: code,
      verificationOtpExpiresAt: expiresAt,
      verificationOtpLastSentAt: new Date(),
    });

    await hospital.save();

    // Dispatch email asynchronously in background so client receives immediate HTTP 201
    sendVerificationEmail(hospital.email, code).catch((emailErr) => {
      console.warn('[WARN] Background email dispatch error:', emailErr.message);
    });

    return res.status(201).json({
      success: true,
      message: 'Registered. Verify your email. Your account will stay pending until Super Admin approves it.',
      hospitalId: hospital._id.toString(),
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const email = req.body.email || req.query.email;
    const code = req.body.code || req.body.token || req.query.code || req.query.token;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email and verification code are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const hospital = await Hospital.findOne({ email: cleanEmail });

    if (!hospital) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification code.',
      });
    }

    if (
      hospital.verificationOtp !== code.trim() ||
      !hospital.verificationOtpExpiresAt ||
      hospital.verificationOtpExpiresAt < new Date()
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification code.',
      });
    }

    // Set ONLY emailVerified = true. DO NOT change verificationStatus (must stay 'pending').
    hospital.emailVerified = true;
    hospital.verificationOtp = null;
    hospital.verificationOtpExpiresAt = null;
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified. Go to login page.',
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyEmailOtp = exports.verifyEmail;

exports.resendEmailCode = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const hospital = await Hospital.findOne({ email: cleanEmail });

    if (hospital && !hospital.emailVerified) {
      const now = new Date();
      if (
        hospital.verificationOtpLastSentAt &&
        (now.getTime() - new Date(hospital.verificationOtpLastSentAt).getTime()) / 1000 < RESEND_COOLDOWN_SECONDS
      ) {
        return res.status(429).json({
          success: false,
          error: `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.`,
        });
      }

      const { code, expiresAt } = generateResetCode();
      hospital.verificationOtp = code;
      hospital.verificationOtpExpiresAt = expiresAt;
      hospital.verificationOtpLastSentAt = now;
      await hospital.save();

      // Dispatch email asynchronously
      sendVerificationEmail(hospital.email, code).catch((err) => {
        console.warn('[WARN] Background email dispatch error:', err.message);
      });
    }

    return res.status(200).json({
      success: true,
      message: 'If an unverified account exists with that email, a new code has been sent.',
    });
  } catch (error) {
    next(error);
  }
};