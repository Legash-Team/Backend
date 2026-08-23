// Backend/src/controllers/donorProfileController.js
const Donor = require('../models/Donor');
const Hospital = require('../models/Hospital');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { sendOtp, verifyOtp } = require('../services/smsService');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');
const generateResetCode = require('../utils/generateResetCode');

exports.getProfile = async (req, res, next) => {
  try {
    const donor = await Donor.findById(req.user.id);
    if (!donor || donor.isDeleted) {
      return res.status(404).json({ success: false, error: 'Donor not found.' });
    }

    return res.status(200).json({
      success: true,
      profile: {
        id: donor._id,
        name: donor.name,
        phone: donor.phone,
        fin: donor.fin,
        gender: donor.gender,
        bloodType: donor.bloodType,
        dob: donor.dob,
        weightKg: donor.weightKg,
        heightCm: donor.heightCm,
        healthNotes: donor.healthNotes || '',
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, dob, bloodType, weightKg, heightCm, healthNotes, fin, gender } = req.body;

    if (fin !== undefined || gender !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'FIN and gender are immutable and cannot be updated.',
      });
    }

    const donor = await Donor.findById(req.user.id);
    if (!donor || donor.isDeleted) {
      return res.status(404).json({ success: false, error: 'Donor not found.' });
    }

    if (name) donor.name = name.trim();
    if (dob) donor.dob = new Date(dob);
    if (bloodType) {
      if (!VALID_BLOOD_TYPES.includes(bloodType) && bloodType !== 'unknown') {
        return res.status(400).json({ success: false, error: 'Invalid blood type.' });
      }
      donor.bloodType = bloodType;
    }
    if (weightKg !== undefined) donor.weightKg = Number(weightKg);
    if (heightCm !== undefined) donor.heightCm = Number(heightCm);
    if (healthNotes !== undefined) donor.healthNotes = healthNotes;

    await donor.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      profile: {
        name: donor.name,
        phone: donor.phone,
        fin: donor.fin,
        gender: donor.gender,
        bloodType: donor.bloodType,
        dob: donor.dob,
        weightKg: donor.weightKg,
        heightCm: donor.heightCm,
        healthNotes: donor.healthNotes || '',
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.requestPhoneChange = async (req, res, next) => {
  try {
    const { newPhone } = req.body;
    if (!newPhone || !/^\+251\d{9}$/.test(newPhone)) {
      return res.status(400).json({ success: false, error: 'New phone must be in +251 format.' });
    }

    const cleanNewPhone = newPhone.trim();
    const existing = await Donor.findOne({ phone: cleanNewPhone });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Phone number already registered.' });
    }

    const donor = await Donor.findById(req.user.id);
    const { code, expiresAt } = generateResetCode();

    donor.pendingPhone = cleanNewPhone;
    donor.pendingPhoneOtp = code;
    donor.pendingPhoneOtpExpiresAt = expiresAt;
    await donor.save();

    await sendOtp(donor.phone);

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your current phone number to authorize change.',
    });
  } catch (error) {
    next(error);
  }
};

exports.confirmPhoneChange = async (req, res, next) => {
  try {
    const { code } = req.body;
    const donor = await Donor.findById(req.user.id);

    if (!donor || !donor.pendingPhone || !donor.pendingPhoneOtp) {
      return res.status(400).json({ success: false, error: 'No phone change request pending.' });
    }

    if (
      donor.pendingPhoneOtp !== code?.trim() ||
      !donor.pendingPhoneOtpExpiresAt ||
      donor.pendingPhoneOtpExpiresAt < new Date()
    ) {
      return res.status(400).json({ success: false, error: 'Invalid or expired code.' });
    }

    donor.phone = donor.pendingPhone;
    donor.pendingPhone = null;
    donor.pendingPhoneOtp = null;
    donor.pendingPhoneOtpExpiresAt = null;
    await donor.save();

    return res.status(200).json({
      success: true,
      message: 'Phone number updated successfully.',
      phone: donor.phone,
    });
  } catch (error) {
    next(error);
  }
};

exports.changePin = async (req, res, next) => {
  try {
    const { currentPin, newPin, confirmPin } = req.body;

    if (newPin !== confirmPin) {
      return res.status(400).json({ success: false, error: 'PIN confirmation does not match.' });
    }

    const donor = await Donor.findById(req.user.id);
    if (!donor) {
      return res.status(404).json({ success: false, error: 'Donor not found.' });
    }

    const isValid = await comparePassword(currentPin, donor.pinHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Current PIN is incorrect.' });
    }

    donor.pinHash = await hashPassword(newPin);
    donor.pinSetAt = new Date();
    await donor.save();

    return res.status(200).json({
      success: true,
      message: 'PIN changed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const donor = await Donor.findById(req.user.id);
    if (!donor) {
      return res.status(404).json({ success: false, error: 'Donor not found.' });
    }

    donor.isDeleted = true;
    donor.phone = `${donor.phone}_deleted_${Date.now()}`;
    donor.fin = `${donor.fin}_deleted_${Date.now()}`;
    await donor.save();

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

exports.getBloodCenters = async (req, res, next) => {
  try {
    const donor = await Donor.findById(req.user.id);
    let centers = [];

    if (
      donor &&
      donor.location &&
      Array.isArray(donor.location.coordinates) &&
      donor.location.coordinates.length === 2
    ) {
      try {
        centers = await Hospital.find({
          verificationStatus: 'approved',
          isDeleted: { $ne: true },
          location: {
            $near: {
              $geometry: donor.location,
              $maxDistance: 100000, // 100 km radius
            },
          },
        }).select('hospitalName phone email location licenseNumber');
      } catch (_) {
        // Fall back to standard query if geospatial index query encounters issues
        centers = [];
      }
    }

    if (!centers || centers.length === 0) {
      centers = await Hospital.find({
        verificationStatus: 'approved',
        isDeleted: { $ne: true },
      })
        .select('hospitalName phone email location licenseNumber')
        .limit(30);
    }

    const formattedCenters = centers.map((h) => {
      const [lng, lat] =
        Array.isArray(h.location?.coordinates) && h.location.coordinates.length === 2
          ? h.location.coordinates
          : [38.75, 9.03];
      return {
        id: h._id,
        name: h.hospitalName,
        phone: h.phone,
        email: h.email,
        address: h.location?.address || 'Addis Ababa, Ethiopia',
        lat,
        lng,
        licenseNumber: h.licenseNumber,
        status: 'Open for Donations',
      };
    });

    return res.status(200).json({
      success: true,
      centers: formattedCenters,
    });
  } catch (error) {
    next(error);
  }
};