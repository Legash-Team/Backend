const Hospital = require('../models/Hospital');
const { hashPassword } = require('../utils/hashUtils'); // Shared utility from #1
const { sendVerificationEmail } = require('../services/emailService'); // Shared utility from #1

exports.registerHospital = async (req, res, next) => {
  try {
    const { name, email, password, phone, licenseNumber, location } = req.body;

    // Password hashing using shared utility
    const hashedPassword = await hashPassword(password);

    const hospital = new Hospital({
      name,
      email,
      password: hashedPassword,
      phone,
      licenseNumber,
      location,
      isEmailVerified: false,
      isApprovedByAdmin: false // Explicitly pending as per requirements
    });

    await hospital.save();

    // Send verification email with a link
    // The verification token logic is usually part of shared utilities (Issue #1)
    await sendVerificationEmail(hospital.email, hospital._id);

    res.status(201).json({
      message: "Hospital registered successfully. Please verify your email.",
      hospitalId: hospital._id
    });
  } catch (error) {
    next(error); // Handled by global error handler from #1
  }
};

// @desc    Verify hospital email
// @route   GET /api/hospitals/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

    // In a real scenario, you'd verify a JWT or find by a specific token field.
    // For this implementation, we assume the token identifies the hospital.
    const hospital = await Hospital.findById(token);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Invalid verification link or hospital not found.'
      });
    }

    if (hospital.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.'
      });
    }

    hospital.isEmailVerified = true;
    await hospital.save();

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in once approved by the admin.'
    });
  } catch (error) {
    next(error);
  }
};