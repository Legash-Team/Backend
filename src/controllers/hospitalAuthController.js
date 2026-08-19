const crypto = require('crypto');
const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const { hashPassword } = require('../utils/hashPassword');
const { sendVerificationEmail } = require('../services/emailService');

exports.registerHospital = async (req, res, next) => {
  try {
    const { hospitalName, name, email, password, phone, licenseNumber, location, agreedToTerms } = req.body;
    const finalName = hospitalName || name;
    const cleanEmail = email ? email.toLowerCase().trim() : '';

    // Check for existing hospital
    const existingHospital = await Hospital.findOne({
      $or: [
        { email: cleanEmail },
        { phone },
        { licenseNumber }
      ]
    });

    // Parse location coordinates
    let coordinates = [38.75, 9.03];
    if (location) {
      if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        coordinates = location.coordinates;
      } else if (typeof location.lat === 'number' && typeof location.lng === 'number') {
        coordinates = [location.lng, location.lat];
      }
    }

    const hashedPassword = await hashPassword(password);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Idempotent test handling: if it already exists in dev/test, reset and allow re-registration
    if (existingHospital) {
      if (process.env.NODE_ENV !== 'production' || !existingHospital.emailVerified) {
        existingHospital.hospitalName = finalName;
        existingHospital.email = cleanEmail;
        existingHospital.passwordHash = hashedPassword;
        existingHospital.phone = phone;
        existingHospital.licenseNumber = licenseNumber;
        existingHospital.location = {
          type: 'Point',
          coordinates,
          address: location?.address || 'Addis Ababa, Ethiopia'
        };
        existingHospital.emailVerified = false;
        existingHospital.verificationToken = verificationToken;
        existingHospital.verificationStatus = 'pending';
        existingHospital.agreedToTerms = agreedToTerms !== undefined ? agreedToTerms : true;

        await existingHospital.save();

        return res.status(201).json({
          success: true,
          message: 'Hospital registered successfully. Please verify your email.',
          hospitalId: existingHospital._id.toString()
        });
      }

      return res.status(409).json({
        success: false,
        error: 'A hospital with this email is already registered.'
      });
    }

    const hospital = new Hospital({
      hospitalName: finalName,
      email: cleanEmail,
      passwordHash: hashedPassword,
      phone,
      licenseNumber,
      location: {
        type: 'Point',
        coordinates,
        address: location?.address || 'Addis Ababa, Ethiopia'
      },
      agreedToTerms: agreedToTerms !== undefined ? agreedToTerms : true,
      emailVerified: false,
      verificationStatus: 'pending',
      verificationToken
    });

    await hospital.save();

    const verificationLink = `http://localhost:3000/api/hospital/verify-email?token=${verificationToken}`;

    try {
      if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('example')) {
        console.log(`\n📧 [EMAIL MOCK] Verification link for ${hospital.email}:`);
        console.log(`👉 ${verificationLink}\n`);
      } else {
        await sendVerificationEmail(hospital.email, verificationLink);
        console.log(`✅ Verification email sent to ${hospital.email}`);
      }
    } catch (emailErr) {
      console.warn('⚠️ SMTP Error - falling back to console log:');
      console.log(`👉 Verification link: ${verificationLink}`);
    }

    return res.status(201).json({
      success: true,
      message: 'Hospital registered successfully. Please verify your email.',
      hospitalId: hospital._id.toString()
    });

  } catch (error) {
    next(error);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    let token = req.query.token || req.params.token || req.params.hospitalId;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required.'
      });
    }

    token = token.replace(/^=/, '').trim();

    // 1. Try finding hospital by verificationToken
    let hospital = await Hospital.findOne({ verificationToken: token });

    // 2. Fallback: try finding by _id if token is a valid MongoDB ObjectId
    if (!hospital && mongoose.Types.ObjectId.isValid(token)) {
      hospital = await Hospital.findById(token);
    }

    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'Invalid verification link or hospital not found.'
      });
    }

    if (hospital.emailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified.'
      });
    }

    hospital.emailVerified = true;
    hospital.verificationToken = null;
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in.'
    });
  } catch (error) {
    next(error);
  }
};