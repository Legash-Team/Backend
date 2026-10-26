// Backend/src/controllers/bloodCenterProfileController.js
const Admin = require('../models/Admin');
const Hospital = require('../models/Hospital');
const { hashPassword, comparePassword } = require('../utils/hashPassword');
const { generateMapsUrl } = require('../utils/mapsUrl');

/**
 * GET /api/blood-center/profile
 * Get blood center profile details.
 */
exports.getProfile = async (req, res, next) => {
  try {
    const admin = await Admin.findOne({
      _id: req.user.id || req.user._id,
      isDeleted: { $ne: true }
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: 'Blood center account not found.'
      });
    }

    const lat = admin.location?.coordinates?.[1] ?? null;
    const lng = admin.location?.coordinates?.[0] ?? null;
    const mapsUrl = admin.location ? generateMapsUrl(admin.location) : null;

    return res.status(200).json({
      success: true,
      profile: {
        id: admin._id,
        name: admin.name,
        centerName: admin.centerName || admin.name,
        email: admin.email,
        phone: admin.phone || '',
        location: {
          lat,
          lng,
          address: admin.location?.address || '',
          mapsUrl
        },
        permissions: admin.permissions || { canApproveHospitals: false, canPostEvents: true },
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/blood-center/profile
 * Update editable blood center fields: email, location, centerName, name, phone.
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const { centerName, name, email, phone, location } = req.body;

    const admin = await Admin.findOne({
      _id: req.user.id || req.user._id,
      isDeleted: { $ne: true }
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: 'Blood center account not found.'
      });
    }

    if (centerName && typeof centerName === 'string' && centerName.trim()) {
      admin.centerName = centerName.trim();
    }

    if (name && typeof name === 'string' && name.trim()) {
      admin.name = name.trim();
    }

    if (email && typeof email === 'string' && email.trim()) {
      const cleanEmail = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid email address.'
        });
      }

      if (cleanEmail !== admin.email) {
        // Check uniqueness across Admin and Hospital
        const [existingAdmin, existingHospital] = await Promise.all([
          Admin.findOne({ email: cleanEmail, _id: { $ne: admin._id }, isDeleted: { $ne: true } }),
          Hospital.findOne({ email: cleanEmail, isDeleted: { $ne: true } })
        ]);

        if (existingAdmin || existingHospital) {
          return res.status(400).json({
            success: false,
            error: 'This email is already in use by another account.'
          });
        }
        admin.email = cleanEmail;
      }
    }

    if (phone !== undefined) {
      admin.phone = phone && typeof phone === 'string' ? phone.trim() : null;
    }

    const locObj = (location && typeof location === 'object') ? location : (req.body.address || req.body.lat !== undefined ? req.body : null);
    if (locObj) {
      const address = locObj.address && typeof locObj.address === 'string' ? locObj.address.trim() : (admin.location?.address || '');
      let coordinates = admin.location?.coordinates;

      if (Array.isArray(locObj.coordinates) && locObj.coordinates.length === 2) {
        const [lng, lat] = locObj.coordinates.map(Number);
        if (!isNaN(lng) && !isNaN(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          coordinates = [lng, lat];
        }
      } else if (locObj.lat !== undefined && locObj.lng !== undefined) {
        const lat = Number(locObj.lat);
        const lng = Number(locObj.lng);
        if (!isNaN(lng) && !isNaN(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          coordinates = [lng, lat];
        }
      }

      if (coordinates) {
        admin.location = {
          type: 'Point',
          coordinates,
          address
        };
      } else if (address) {
        admin.location = {
          type: 'Point',
          coordinates: admin.location?.coordinates || [38.74, 9.01],
          address
        };
      }
    }

    await admin.save();

    const lat = admin.location?.coordinates?.[1] ?? null;
    const lng = admin.location?.coordinates?.[0] ?? null;
    const mapsUrl = admin.location ? generateMapsUrl(admin.location) : null;

    return res.status(200).json({
      success: true,
      message: 'Blood center profile updated successfully.',
      profile: {
        id: admin._id,
        name: admin.name,
        centerName: admin.centerName || admin.name,
        email: admin.email,
        phone: admin.phone || '',
        location: {
          lat,
          lng,
          address: admin.location?.address || '',
          mapsUrl
        },
        permissions: admin.permissions || { canApproveHospitals: false, canPostEvents: true },
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/blood-center/profile/change-password
 * Change password for authenticated blood center admin.
 */
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required.'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters long.'
      });
    }

    const admin = await Admin.findOne({
      _id: req.user.id || req.user._id,
      isDeleted: { $ne: true }
    });

    if (!admin || !admin.passwordHash) {
      return res.status(404).json({
        success: false,
        error: 'Account not found.'
      });
    }

    const isMatch = await comparePassword(currentPassword, admin.passwordHash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect.'
      });
    }

    admin.passwordHash = await hashPassword(newPassword);
    await admin.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (error) {
    next(error);
  }
};
