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

module.exports = {
  registerDonor,
  verifyDonorOtp,
};