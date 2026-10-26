// Backend/src/controllers/donorProfileController.js
const Donor = require('../models/Donor');
const Hospital = require('../models/Hospital');
const Admin = require('../models/Admin');
const BloodRequestResponse = require('../models/BloodRequestResponse');
const DonationRecord = require('../models/DonationRecord');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { sendOtp, verifyOtp } = require('../services/smsService');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');
const generateResetCode = require('../utils/generateResetCode');
const { generateMapsUrl } = require('../utils/mapsUrl');
const { generateUniqueDonorShortId } = require('../utils/generateShortId');

exports.getProfile = async (req, res, next) => {
  try {
    const donor = await Donor.findById(req.user.id);
    if (!donor || donor.isDeleted) {
      return res.status(404).json({ success: false, error: 'Donor not found.' });
    }

    if (!donor.shortId) {
      donor.shortId = await generateUniqueDonorShortId();
      await donor.save();
    }

    return res.status(200).json({
      success: true,
      profile: {
        id: donor._id,
        shortId: donor.shortId || null,
        name: donor.name,
        phone: donor.phone,
        fin: donor.fin,
        gender: donor.gender,
        bloodType: donor.bloodType,
        dob: donor.dob,
        weightKg: donor.weightKg,
        heightCm: donor.heightCm,
        healthNotes: donor.healthNotes || '',
        lastDonatedAt: donor.lastDonatedAt || null,
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
        id: donor._id,
        shortId: donor.shortId || null,
        name: donor.name,
        phone: donor.phone,
        fin: donor.fin,
        gender: donor.gender,
        bloodType: donor.bloodType,
        dob: donor.dob,
        weightKg: donor.weightKg,
        heightCm: donor.heightCm,
        healthNotes: donor.healthNotes || '',
        lastDonatedAt: donor.lastDonatedAt || null,
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
    const donorId = req.user.id || req.user._id;
    const donor = await Donor.findOne({ _id: donorId, isDeleted: { $ne: true } });
    if (!donor) {
      return res.status(404).json({ success: false, error: 'Donor not found.' });
    }

    // 1. Delete all donor-specific responses and notification records
    // This removes donor from hospital confirmation queues, pending alerts, and notification history
    await BloodRequestResponse.deleteMany({ donor: donor._id });

    // 2. Anonymize completed donation records for hospital operational & audit retention:
    // Unlink donor reference and scrub any personal notes / messages so no donor PII remains accessible
    await DonationRecord.updateMany(
      { donor: donor._id },
      {
        $set: {
          donor: null,
          thankYouMessage: null,
          notes: null,
          healthIssues: null,
        },
      }
    );

    // 3. Remove non-completed donation records if any exist
    await DonationRecord.deleteMany({ donor: donor._id, outcome: { $ne: 'donated' } });

    // 4. Permanent hard delete of the donor profile, credentials, and account
    await Donor.findByIdAndDelete(donor._id);

    return res.status(200).json({
      success: true,
      message: 'Account and associated personal data deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

exports.getBloodCenters = async (req, res, next) => {
  try {
    const donor = await Donor.findById(req.user.id);
    let centers = [];
    const centerFilter = {
      centerName: { $exists: true, $ne: null },
      isDeleted: { $ne: true },
    };

    if (
      donor &&
      donor.location &&
      Array.isArray(donor.location.coordinates) &&
      donor.location.coordinates.length === 2
    ) {
      try {
        centers = await Admin.find({
          ...centerFilter,
          location: {
            $near: {
              $geometry: donor.location,
              $maxDistance: 100000, // 100 km radius
            },
          },
        }).select('name centerName phone email location');
      } catch (_) {
        centers = [];
      }
    }

    if (!centers || centers.length === 0) {
      centers = await Admin.find(centerFilter)
        .select('name centerName phone email location')
        .limit(30);
    }

    const formattedCenters = centers.map((c) => {
      const hasCoords = Array.isArray(c.location?.coordinates) && c.location.coordinates.length === 2;
      const lng = hasCoords ? c.location.coordinates[0] : null;
      const lat = hasCoords ? c.location.coordinates[1] : null;
      const mapsUrl = generateMapsUrl(c.location);

      return {
        id: c._id,
        name: c.centerName || c.name,
        phone: c.phone || '',
        email: c.email,
        address: c.location?.address || '',
        lat,
        lng,
        mapsUrl,
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