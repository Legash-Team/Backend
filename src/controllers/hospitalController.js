// Backend/src/controllers/hospitalController.js
const Hospital = require('../models/Hospital');
const { sendVerificationEmail } = require('../services/emailService');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');
const generateResetCode = require('../utils/generateResetCode');

function sanitizeHospital(hospital) {
  const lat = hospital.location?.coordinates?.[1] ?? null;
  const lng = hospital.location?.coordinates?.[0] ?? null;

  return {
    id: hospital._id,
    hospitalName: hospital.hospitalName || hospital.name,
    email: hospital.email,
    phone: hospital.phone,
    licenseNumber: hospital.licenseNumber,
    location: {
      lat,
      lng,
      address: hospital.location?.address || '',
    },
    emailVerified: hospital.emailVerified,
    verificationStatus: hospital.verificationStatus,
    bloodStock: hospital.bloodStock || [],
    createdAt: hospital.createdAt,
    updatedAt: hospital.updatedAt,
  };
}

exports.getDashboard = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    return res.status(200).json({
      success: true,
      hospital: sanitizeHospital(hospital),
    });
  } catch (error) {
    next(error);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    return res.status(200).json({
      success: true,
      profile: sanitizeHospital(hospital),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { hospitalName, name, phone, email } = req.body;
    const hospital = await Hospital.findById(req.user.id);

    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const updatedName = hospitalName || name;
    if (updatedName && updatedName.trim().length > 0) {
      hospital.hospitalName = updatedName.trim();
    }

    if (phone && phone.trim() !== hospital.phone) {
      const existingPhone = await Hospital.findOne({ phone: phone.trim(), _id: { $ne: hospital._id } });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this phone number is already registered.',
        });
      }
      hospital.phone = phone.trim();
    }

    let emailChanged = false;
    if (email && email.toLowerCase().trim() !== hospital.email) {
      const cleanEmail = email.toLowerCase().trim();
      const existingEmail = await Hospital.findOne({ email: cleanEmail, _id: { $ne: hospital._id } });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this email is already registered.',
        });
      }

      hospital.email = cleanEmail;
      hospital.emailVerified = false;
      emailChanged = true;

      const { code, expiresAt } = generateResetCode();
      hospital.verificationToken = code;
      hospital.resetCodeExpiresAt = expiresAt;

      try {
        await sendVerificationEmail(hospital.email, code);
      } catch (err) {
        console.warn('⚠️ SMTP Error on email update verification:', err.message);
      }
    }

    await hospital.save();

    return res.status(200).json({
      success: true,
      message: emailChanged
        ? 'Profile updated. Please verify your new email address.'
        : 'Profile updated successfully.',
      profile: sanitizeHospital(hospital),
    });
  } catch (error) {
    next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Password confirmation does not match.' });
    }

    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const isValid = await comparePassword(currentPassword, hospital.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    hospital.passwordHash = await hashPassword(newPassword);
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    hospital.isDeleted = true;
    hospital.email = `${hospital.email}_deleted_${Date.now()}`;
    hospital.phone = `${hospital.phone}_deleted_${Date.now()}`;
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: 'Hospital account permanently deleted.',
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/hospital/blood-stock
exports.getBloodStock = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const stockMap = {};
    VALID_BLOOD_TYPES.forEach((type) => {
      stockMap[type] = 0;
    });

    const bloodStockList = VALID_BLOOD_TYPES.map((type) => {
      const existing = (hospital.bloodStock || []).find((s) => s.bloodType === type);
      const availableUnits = existing ? existing.availableUnits : 0;
      stockMap[type] = availableUnits;

      return {
        bloodType: type,
        availableUnits,
        reservedUnits: existing ? existing.reservedUnits : 0,
        minimumUnits: existing ? existing.minimumUnits : 0,
      };
    });

    return res.status(200).json({
      success: true,
      bloodStock: bloodStockList,
      stock: stockMap,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/hospital/blood-stock/:bloodType
exports.updateBloodStock = async (req, res, next) => {
  try {
    const { bloodType } = req.params;

    if (!VALID_BLOOD_TYPES.includes(bloodType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid blood type: ${bloodType}. Allowed types: ${VALID_BLOOD_TYPES.join(', ')}`,
      });
    }

    const hospital = await Hospital.findById(req.user.id);
    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    let stockItem = hospital.bloodStock.find((s) => s.bloodType === bloodType);
    if (!stockItem) {
      hospital.bloodStock.push({
        bloodType,
        availableUnits: 0,
        reservedUnits: 0,
        minimumUnits: 0,
      });
      stockItem = hospital.bloodStock.find((s) => s.bloodType === bloodType);
    }

    const { availableUnits, quantity, increment, decrement } = req.body;

    if (availableUnits !== undefined) {
      stockItem.availableUnits = Number(availableUnits);
    } else if (quantity !== undefined) {
      stockItem.availableUnits = Number(quantity);
    } else if (increment !== undefined) {
      stockItem.availableUnits += Number(increment);
    } else if (decrement !== undefined) {
      stockItem.availableUnits -= Number(decrement);
    }

    if (isNaN(stockItem.availableUnits) || stockItem.availableUnits < 0) {
      return res.status(400).json({
        success: false,
        error: 'Blood stock units cannot be negative.',
      });
    }

    hospital.markModified('bloodStock');
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: `Stock updated for ${bloodType}.`,
      bloodType,
      availableUnits: stockItem.availableUnits,
      bloodStock: hospital.bloodStock,
    });
  } catch (error) {
    next(error);
  }
};