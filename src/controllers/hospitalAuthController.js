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