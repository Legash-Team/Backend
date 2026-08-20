// Backend/src/controllers/donorAuthController.js
const Donor = require('../models/Donor');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { sendOtp, verifyOtp } = require('../services/smsService');
const generateToken = require('../utils/generateToken');
const generateResetCode = require('../utils/generateResetCode');

exports.registerDonor = async (req, res, next) => {
  try {
    const { name, phone, fin, gender, bloodType, location, agreedToTerms } = req.body;

    const existing = await Donor.findOne({ $or: [{ phone: phone.trim() }, { fin: fin.trim() }] });
    if (existing) {
      if (existing.phone === phone.trim()) {
        return res.status(409).json({ success: false, error: 'Phone number already registered.' });
      }
      if (existing.fin === fin.trim()) {
        return res.status(409).json({ success: false, error: 'Fayda National ID is already registered.' });
      }
    }

    let coordinates = [38.7613, 9.0108];
    if (location) {
      if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        coordinates = location.coordinates;
      } else if (typeof location.lat === 'number' && typeof location.lng === 'number') {
        coordinates = [location.lng, location.lat];
      }
    }

    const donor = await Donor.create({
      name: (name || '').trim(),
      phone: phone.trim(),
      fin: fin.trim(),
      gender: gender || 'male',
      bloodType: bloodType || 'unknown',
      location: { type: 'Point', coordinates },
      agreedToTerms: agreedToTerms !== undefined ? agreedToTerms : true,
      phoneVerified: false,
      pinHash: null,
    });

    try {
      await sendOtp(donor.phone);
    } catch (err) {
      console.warn('⚠️ OTP SMS dispatch error:', err.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Registered. Enter the OTP sent to your phone to verify your account.',
      donorId: donor._id.toString(),
    });
  } catch (err) {
    next(err);
  }
};

exports.verifyDonorOtp = async (req, res, next) => {
  try {
    const { phone, code } = req.body;
    const isValid = await verifyOtp(phone.trim(), code.trim());
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid or expired code.' });
    }

    await Donor.updateOne({ phone: phone.trim() }, { phoneVerified: true });

    return res.status(200).json({
      success: true,
      message: 'Phone verified. Set your PIN to continue.',
    });
  } catch (err) {
    next(err);
  }
};

exports.resendDonorOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const donor = await Donor.findOne({ phone: phone.trim() });

    if (donor && !donor.phoneVerified) {
      await sendOtp(donor.phone);
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists with that phone number, an OTP has been sent.',
    });
  } catch (err) {
    next(err);
  }
};

exports.setDonorPin = async (req, res, next) => {
  try {
    const { phone, pin, confirmPin } = req.body;

    if (pin !== confirmPin) {
      return res.status(400).json({ success: false, error: 'PIN confirmation does not match.' });
    }

    const donor = await Donor.findOne({ phone: phone.trim() });
    if (!donor) {
      return res.status(404).json({ success: false, error: 'Donor not found.' });
    }

    if (!donor.phoneVerified) {
      return res.status(400).json({ success: false, error: 'Please verify your phone number first.' });
    }

    donor.pinHash = await hashPassword(pin);
    donor.pinSetAt = new Date();
    await donor.save();

    const token = generateToken({ id: donor._id.toString(), role: 'donor' });

    return res.status(200).json({
      success: true,
      token,
      donor: {
        id: donor._id.toString(),
        name: donor.name,
        phone: donor.phone,
        bloodType: donor.bloodType,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.unlockDonor = async (req, res, next) => {
  try {
    const { pin } = req.body;
    const donor = await Donor.findById(req.user.id);

    if (!donor || donor.isDeleted) {
      return res.status(404).json({ success: false, error: 'Donor account not found.' });
    }

    if (!donor.pinHash) {
      return res.status(400).json({ success: false, error: 'PIN has not been set for this account.' });
    }

    const isValid = await comparePassword(pin, donor.pinHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid PIN.' });
    }

    const freshToken = generateToken({ id: donor._id.toString(), role: 'donor' });

    return res.status(200).json({
      success: true,
      token: freshToken,
      donor: {
        id: donor._id.toString(),
        name: donor.name,
        phone: donor.phone,
        bloodType: donor.bloodType,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.forgotDonorPin = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const donor = await Donor.findOne({ phone: phone.trim() });
    if (donor) {
      const { code, expiresAt } = generateResetCode();
      donor.resetCode = code;
      donor.resetCodeExpiresAt = expiresAt;
      await donor.save();
      try {
        await sendOtp(donor.phone);
      } catch (err) {
        console.warn('⚠️ OTP SMS dispatch error:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'If an account exists with that phone number, an OTP has been sent.',
    });
  } catch (err) {
    next(err);
  }
};

exports.resetDonorPin = async (req, res, next) => {
  try {
    const { phone, code, pin, confirmPin } = req.body;

    if (pin !== confirmPin) {
      return res.status(400).json({ success: false, error: 'PIN confirmation does not match.' });
    }

    const isValid = await verifyOtp(phone.trim(), code.trim());
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid or expired code.' });
    }

    const donor = await Donor.findOne({ phone: phone.trim() });
    if (!donor) {
      return res.status(404).json({ success: false, error: 'Donor not found.' });
    }

    donor.pinHash = await hashPassword(pin);
    donor.pinSetAt = new Date();
    donor.resetCode = null;
    donor.resetCodeExpiresAt = null;
    await donor.save();

    const token = generateToken({ id: donor._id.toString(), role: 'donor' });

    return res.status(200).json({
      success: true,
      message: 'PIN reset successful.',
      token,
      donor: {
        id: donor._id.toString(),
        name: donor.name,
        phone: donor.phone,
        bloodType: donor.bloodType,
      },
    });
  } catch (err) {
    next(err);
  }
};