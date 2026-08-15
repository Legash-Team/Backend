const crypto = require('crypto');
const Hospital = require('../models/Hospital');
const { hashPassword } = require('../utils/hashPassword'); // Shared utility from #1
const { sendVerificationEmail } = require('../services/emailService'); // Shared utility from #1

exports.registerHospital = async (req, res, next) => {
  try {
    const { hospitalName, email, password, phone, licenseNumber, location, agreedToTerms } = req.body;

    const existingEmail = await Hospital.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ success: false, error: 'A hospital with this email is already registered.' });
    }

    const existingPhone = await Hospital.findOne({ phone });
    if (existingPhone) {
      return res.status(409).json({ success: false, error: 'A hospital with this phone number is already registered.' });
    }

    const existingLicense = await Hospital.findOne({ licenseNumber });
    if (existingLicense) {
      return res.status(409).json({ success: false, error: 'A hospital with this license number is already registered.' });
    }

    // Password hashing using shared utility
    const hashedPassword = await hashPassword(password);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const hospital = new Hospital({
      hospitalName,
      email,
      passwordHash: hashedPassword,
      phone,
      licenseNumber,
      location: { type: 'Point', coordinates: [location.lng, location.lat] },
      agreedToTerms,
      emailVerified: false,
      verificationStatus: 'pending',
      verificationToken
    });

    await hospital.save();

    // Send verification email safely without crashing the request if SMTP fails
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

    res.status(201).json({
      success: true,
      message: "Registered. Check your email to verify your account. Your account will stay pending until Super Admin approves it.",
      hospitalId: hospital._id
    });

  } catch (error) {
    next(error); // Handled by global error handler from #1
  }
};

// @desc    Verify hospital email
// @route   GET /api/hospital/verify-email?token=<token>
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required.'
      });
    }

    const hospital = await Hospital.findOne({ verificationToken: token });

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

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in.'
    });
  } catch (error) {
    next(error);
  }
};