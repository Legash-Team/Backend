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

    // 1. Strict Duplicate Checks (Email, Phone, License Number)
    const existingHospital = await Hospital.findOne({
      $or: [
        { email: cleanEmail },
        { phone },
        { licenseNumber }
      ]
    });

    if (existingHospital) {
      if (existingHospital.email === cleanEmail) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this email is already registered.'
        });
      }
      if (existingHospital.phone === phone) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this phone number is already registered.'
        });
      }
      if (existingHospital.licenseNumber === licenseNumber) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this license number is already registered.'
        });
      }
    }

    // 2. Parse Coordinates
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

    // 3. Send Verification Email
    const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/hospitals/verify-email/${hospital._id}`;
    try {
      await sendVerificationEmail(hospital.email, verificationLink);
    } catch (emailErr) {
      console.warn('⚠️ SMTP Email dispatch error:', emailErr.message);
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

    let hospital = await Hospital.findOne({ verificationToken: token });

    if (!hospital && mongoose.Types.ObjectId.isValid(token)) {
      hospital = await Hospital.findById(token);
    }

    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'Invalid verification link or hospital not found.'
      });
    }

    if (hospital.emailVerified && hospital.verificationStatus === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.'
      });
    }

    // Set emailVerified = true, keep verificationStatus = 'pending' for Super Admin approval
    hospital.emailVerified = true;
    hospital.verificationToken = null;
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in once approved by the admin.'
    });
  } catch (error) {
    next(error);
  }
};