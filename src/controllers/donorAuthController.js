const Donor = require('../models/Donor');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { sendOtp, verifyOtp } = require('../services/smsService');
const generateToken = require('../utils/generateToken');

async function registerDonor(req, res, next) {
  try {
    const { name, password, phone, fin, gender, bloodType, location, agreedToTerms } = req.body;

    const existing = await Donor.findOne({ phone });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Phone number already registered.' });
    }

    const passwordHash = await hashPassword(password);

    const donor = await Donor.create({
      name,
      passwordHash,
      phone,
      fin,
      gender,
      bloodType,
      location: { type: 'Point', coordinates: [location.lng, location.lat] },
      agreedToTerms,
      phoneVerified: false,
    });

    try {
      await sendOtp(phone);
    } catch (err) {
      await Donor.findByIdAndDelete(donor._id);
      throw err;
    }

    res.status(201).json({
      success: true,
      message: 'Registered. Enter the OTP sent to your phone to verify your account.',
      donorId: donor._id,
    });
  } catch (err) {
    next(err);
  }
}

async function verifyDonorOtp(req, res, next) {
  try {
    const { phone, code } = req.body;

    const valid = await verifyOtp(phone, code);
    if (!valid) {
      return res.status(400).json({ success: false, error: 'Invalid or expired code.' });
    }

    await Donor.updateOne({ phone }, { phoneVerified: true });

    res.status(200).json({ success: true, message: 'Phone verified. You can now log in.' });
  } catch (err) {
    next(err);
  }
}

// ★ NEW RESEND OTP CONTROLLER
async function resendDonorOtp(req, res, next) {
  try {
    const { phone } = req.body;

    const donor = await Donor.findOne({ phone });

    // Anti-enumeration security: if donor does not exist, still return generic 200 message
    if (!donor) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with that phone number, an OTP has been sent.',
      });
    }

    if (donor.phoneVerified) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is already verified.',
      });
    }

    await sendOtp(phone);

    res.status(200).json({
      success: true,
      message: 'A new OTP has been sent to your phone number.',
    });
  } catch (err) {
    next(err);
  }
}

async function loginDonor(req, res, next) {
  try {
    const { phone, password } = req.body;

    const donor = await Donor.findOne({ phone });
    if (!donor) {
      return res.status(401).json({ success: false, error: 'Invalid phone or password.' });
    }

    const valid = await comparePassword(password, donor.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid phone or password.' });
    }

    if (!donor.phoneVerified) {
      return res.status(401).json({
        success: false,
        error: 'Phone not verified. Please verify your phone number first.',
      });
    }

    const token = generateToken({ id: donor._id, role: 'donor' });

    res.status(200).json({
      success: true,
      token,
      donor: { id: donor._id, name: donor.name, phone: donor.phone },
    });
  } catch (err) {
    next(err);
  }
}

async function forgotDonorPassword(req, res, next) {
  try {
    const { phone } = req.body;

    const donor = await Donor.findOne({ phone });
    if (donor) {
      await sendOtp(phone);
    }

    res.status(200).json({
      success: true,
      message: 'If an account exists with that phone number, an OTP has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

async function resetDonorPassword(req, res, next) {
  try {
    const { phone, code, newPassword } = req.body;

    const valid = await verifyOtp(phone, code);
    if (!valid) {
      return res.status(400).json({ success: false, error: 'Invalid or expired code.' });
    }

    const passwordHash = await hashPassword(newPassword);
    await Donor.updateOne({ phone }, { passwordHash });

    res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerDonor,
  verifyDonorOtp,
  resendDonorOtp, // ★ Exported
  loginDonor,
  forgotDonorPassword,
  resetDonorPassword,
};