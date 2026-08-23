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
    const { hospitalName, name, phone } = req.body;
    const hospital = await Hospital.findById(req.user.id);

    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const updatedName = hospitalName || name;
    if (updatedName && updatedName.trim().length > 0) {
      hospital.hospitalName = updatedName.trim();
    }

    if (phone && phone.trim() !== hospital.phone) {
      const cleanPhone = phone.trim();
      const existingPhone = await Hospital.findOne({ phone: cleanPhone, _id: { $ne: hospital._id } });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this phone number is already registered.',
        });
      }
      hospital.phone = cleanPhone;
    }

    await hospital.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      profile: sanitizeHospital(hospital),
    });
  } catch (error) {
    next(error);
  }
};

exports.requestEmailChange = async (req, res, next) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail) {
      return res.status(400).json({ success: false, error: 'New email is required.' });
    }

    const cleanEmail = newEmail.toLowerCase().trim();
    const existing = await Hospital.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email is already registered.' });
    }

    const hospital = await Hospital.findById(req.user.id);
    const { code, expiresAt } = generateResetCode();

    hospital.pendingEmail = cleanEmail;
    hospital.pendingEmailOtp = code;
    hospital.pendingEmailOtpExpiresAt = expiresAt;
    await hospital.save();

    try {
      await sendVerificationEmail(cleanEmail, code);
    } catch (err) {
      console.warn('[WARN] SMTP Error:', err.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Verification OTP sent to your new email address.',
    });
  } catch (error) {
    next(error);
  }
};

exports.confirmEmailChange = async (req, res, next) => {
  try {
    const { code } = req.body;
    const hospital = await Hospital.findById(req.user.id);

    if (!hospital || !hospital.pendingEmail || !hospital.pendingEmailOtp) {
      return res.status(400).json({ success: false, error: 'No email change pending.' });
    }

    if (
      hospital.pendingEmailOtp !== code?.trim() ||
      !hospital.pendingEmailOtpExpiresAt ||
      hospital.pendingEmailOtpExpiresAt < new Date()
    ) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification code.' });
    }

    hospital.email = hospital.pendingEmail;
    hospital.pendingEmail = null;
    hospital.pendingEmailOtp = null;
    hospital.pendingEmailOtpExpiresAt = null;
    hospital.emailVerified = true;
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: 'Email address updated successfully.',
      email: hospital.email,
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
    hospital.licenseNumber = `${hospital.licenseNumber}_deleted_${Date.now()}`;
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

// PUT /api/hospital/blood-stock
exports.updateAllBloodStock = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const payload = req.body.bloodStock || req.body.stock || req.body;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid blood stock payload.' });
    }

    if (!Array.isArray(hospital.bloodStock) || hospital.bloodStock.length === 0) {
      hospital.bloodStock = VALID_BLOOD_TYPES.map((type) => ({
        bloodType: type,
        availableUnits: 0,
        reservedUnits: 0,
        minimumUnits: 0,
      }));
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (!item || !item.bloodType || !VALID_BLOOD_TYPES.includes(item.bloodType)) {
          return res.status(400).json({
            success: false,
            error: `Invalid blood type in payload: ${item?.bloodType}. Allowed types: ${VALID_BLOOD_TYPES.join(', ')}`,
          });
        }
        const units = Number(item.availableUnits ?? item.quantity ?? 0);
        if (isNaN(units) || units < 0) {
          return res.status(400).json({
            success: false,
            error: `Blood stock units for ${item.bloodType} cannot be negative.`,
          });
        }
        let stockItem = hospital.bloodStock.find((s) => s.bloodType === item.bloodType);
        if (!stockItem) {
          hospital.bloodStock.push({
            bloodType: item.bloodType,
            availableUnits: units,
            reservedUnits: 0,
            minimumUnits: 0,
          });
        } else {
          stockItem.availableUnits = units;
        }
      }
    } else {
      for (const type of VALID_BLOOD_TYPES) {
        if (payload[type] !== undefined) {
          const units = Number(payload[type]);
          if (isNaN(units) || units < 0) {
            return res.status(400).json({
              success: false,
              error: `Blood stock units for ${type} cannot be negative.`,
            });
          }
          let stockItem = hospital.bloodStock.find((s) => s.bloodType === type);
          if (!stockItem) {
            hospital.bloodStock.push({
              bloodType: type,
              availableUnits: units,
              reservedUnits: 0,
              minimumUnits: 0,
            });
          } else {
            stockItem.availableUnits = units;
          }
        }
      }
    }

    hospital.markModified('bloodStock');
    await hospital.save();

    const stockMap = {};
    VALID_BLOOD_TYPES.forEach((type) => {
      stockMap[type] = 0;
    });

    const bloodStockList = VALID_BLOOD_TYPES.map((type) => {
      const existing = hospital.bloodStock.find((s) => s.bloodType === type);
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
      message: 'Blood stock inventory updated successfully.',
      stock: stockMap,
      bloodStock: stockMap,
      data: bloodStockList,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/hospital/blood-stock/:bloodType
exports.updateBloodStock = async (req, res, next) => {
  try {
    const rawBloodType = req.params.bloodType;
    const bloodType = rawBloodType ? decodeURIComponent(rawBloodType) : '';

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

// GET /api/hospital/search?bloodType=A%2B&quantity=5
exports.searchHospitals = async (req, res, next) => {
  try {
    const { bloodType, quantity } = req.query;

    if (!bloodType || !VALID_BLOOD_TYPES.includes(bloodType)) {
      return res.status(400).json({
        success: false,
        error: `Valid bloodType is required. Allowed types: ${VALID_BLOOD_TYPES.join(', ')}`,
      });
    }

    const minQty = quantity ? Number(quantity) : 0;
    if (isNaN(minQty) || minQty < 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantity must be a positive number.',
      });
    }

    // Find all approved hospitals that are not deleted and not the current hospital
    const query = {
      _id: { $ne: req.user.id },
      verificationStatus: 'approved',
      isDeleted: { $ne: true },
      'bloodStock.bloodType': bloodType,
    };

    // If a minimum quantity was specified, we can query hospitals that have some stock
    // But since the requirement says "a hospital with fewer kits than requested can still appear in results",
    // we query hospitals where availableUnits > 0.
    query['bloodStock'] = {
      $elemMatch: {
        bloodType,
        availableUnits: { $gt: 0 },
      },
    };

    const hospitals = await Hospital.find(query);

    const results = hospitals.map((h) => {
      const lat = h.location?.coordinates?.[1] ?? null;
      const lng = h.location?.coordinates?.[0] ?? null;

      return {
        id: h._id,
        name: h.hospitalName || h.name,
        email: h.email,
        phone: h.phone,
        licenseNumber: h.licenseNumber,
        location: {
          lat,
          lng,
          address: h.location?.address || '',
        },
        // We do NOT expose the exact availableUnits to prevent data leakage!
        // Just return that it is in stock or available.
        hasStock: true,
      };
    });

    return res.status(200).json({
      success: true,
      results,
      hospitals: results,
    });
  } catch (error) {
    next(error);
  }
};