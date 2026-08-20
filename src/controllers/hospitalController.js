const Hospital = require('../models/Hospital');
const { sendVerificationEmail } = require('../services/emailService');

const VALID_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Helper to sanitize hospital documents
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
      address: hospital.location?.address || ''
    },
    emailVerified: hospital.emailVerified,
    verificationStatus: hospital.verificationStatus,
    bloodStock: hospital.bloodStock || [],
    createdAt: hospital.createdAt,
    updatedAt: hospital.updatedAt
  };
}

// 1. Dashboard: Profile + Stock formatted for logged-in hospital
exports.getDashboard = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id).select(
      '-passwordHash -verificationToken -resetCode -resetCodeExpiresAt'
    );

    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    return res.status(200).json({
      success: true,
      hospital: sanitizeHospital(hospital)
    });
  } catch (error) {
    next(error);
  }
};

// 2. Profile: Get Profile
exports.getProfile = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id).select(
      '-passwordHash -verificationToken -resetCode -resetCodeExpiresAt'
    );

    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    return res.status(200).json({
      success: true,
      profile: sanitizeHospital(hospital)
    });
  } catch (error) {
    next(error);
  }
};

// 3. Profile Update: Allows updating name, phone, email (licenseNumber & location immutable)
exports.updateProfile = async (req, res, next) => {
  try {
    const { hospitalName, name, phone, email } = req.body;
    const hospital = await Hospital.findById(req.user.id);

    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const updatedName = hospitalName || name;
    if (updatedName && typeof updatedName === 'string' && updatedName.trim().length > 0) {
      hospital.hospitalName = updatedName.trim();
    }

    // Phone Update Check
    if (phone && phone !== hospital.phone) {
      const existingPhone = await Hospital.findOne({ phone, _id: { $ne: hospital._id } });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this phone number is already registered.'
        });
      }
      hospital.phone = phone.trim();
    }

    // Email Update Check: Must reset emailVerified = false and trigger verification email
    let emailChanged = false;
    if (email && email.toLowerCase().trim() !== hospital.email) {
      const cleanEmail = email.toLowerCase().trim();
      const existingEmail = await Hospital.findOne({ email: cleanEmail, _id: { $ne: hospital._id } });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'A hospital with this email is already registered.'
        });
      }

      hospital.email = cleanEmail;
      hospital.emailVerified = false;
      emailChanged = true;
    }

    await hospital.save();

    if (emailChanged) {
      const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/hospitals/verify-email/${hospital._id}`;
      try {
        await sendVerificationEmail(hospital.email, verificationLink);
      } catch (err) {
        console.warn('⚠️ SMTP Error on email update verification:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: emailChanged
        ? 'Profile updated. Please verify your new email address.'
        : 'Profile updated successfully.',
      profile: sanitizeHospital(hospital)
    });
  } catch (error) {
    next(error);
  }
};

// 4. Blood Stock: Get Stock
exports.getStock = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    return res.status(200).json({
      success: true,
      bloodStock: hospital.bloodStock
    });
  } catch (error) {
    next(error);
  }
};

// 5. Blood Stock: Replace / Update Full Stock Array
exports.updateStock = async (req, res, next) => {
  try {
    const stockInput = req.body.stock || req.body.bloodStock || req.body;

    if (!Array.isArray(stockInput)) {
      return res.status(400).json({
        success: false,
        error: 'Stock payload must be an array of blood stock items.'
      });
    }

    const submittedTypes = new Set();
    const newStock = [];

    for (const item of stockInput) {
      if (!item || !VALID_BLOOD_TYPES.includes(item.bloodType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid blood type: ${item?.bloodType}. Allowed types: ${VALID_BLOOD_TYPES.join(', ')}`
        });
      }

      const availableUnits = Number(item.availableUnits !== undefined ? item.availableUnits : item.quantity);
      const reservedUnits = Number(item.reservedUnits !== undefined ? item.reservedUnits : 0);

      if (isNaN(availableUnits) || availableUnits < 0 || isNaN(reservedUnits) || reservedUnits < 0) {
        return res.status(400).json({
          success: false,
          error: `Units for blood type ${item.bloodType} must be non-negative numbers.`
        });
      }

      submittedTypes.add(item.bloodType);
      newStock.push({
        bloodType: item.bloodType,
        availableUnits,
        reservedUnits,
        minimumUnits: Number(item.minimumUnits) || 0
      });
    }

    for (const requiredType of VALID_BLOOD_TYPES) {
      if (!submittedTypes.has(requiredType)) {
        return res.status(400).json({
          success: false,
          error: `All 8 blood types must be provided. Missing type: ${requiredType}`
        });
      }
    }

    const hospital = await Hospital.findById(req.user.id);
    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    hospital.bloodStock = newStock;
    hospital.markModified('bloodStock');
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: 'Blood stock updated successfully.',
      bloodStock: hospital.bloodStock
    });
  } catch (error) {
    next(error);
  }
};

// 6. Geospatial Search: Find nearby approved peer hospitals
exports.searchHospitals = async (req, res, next) => {
  try {
    const { bloodType, quantity, radiusKm, minUnits } = req.query;

    const currentHospital = await Hospital.findById(req.user.id);
    if (!currentHospital || !currentHospital.location?.coordinates) {
      return res.status(404).json({ success: false, error: 'Hospital location not found.' });
    }

    const maxDistanceMeters = (Number(radiusKm) || 50) * 1000;
    const requestedUnits = Number(quantity) || 1;

    const matchQuery = {
      _id: { $ne: currentHospital._id },
      verificationStatus: 'approved',
      isDeleted: { $ne: true },
      location: {
        $near: {
          $geometry: currentHospital.location,
          $maxDistance: maxDistanceMeters
        }
      }
    };

    if (bloodType) {
      if (!VALID_BLOOD_TYPES.includes(bloodType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid blood type query: ${bloodType}`
        });
      }
      if (minUnits !== undefined && Number(minUnits) > 0) {
        matchQuery.bloodStock = {
          $elemMatch: {
            bloodType,
            availableUnits: { $gte: Number(minUnits) }
          }
        };
      }
    }

    const peerHospitals = await Hospital.find(matchQuery).select(
      'hospitalName phone email location bloodStock'
    );

    const formattedResults = peerHospitals.map(h => {
      const targetStock = bloodType
        ? h.bloodStock.find(s => s.bloodType === bloodType)
        : null;

      const avail = targetStock ? targetStock.availableUnits : 0;

      return {
        id: h._id,
        hospitalName: h.hospitalName,
        phone: h.phone,
        email: h.email,
        location: {
          lat: h.location?.coordinates?.[1],
          lng: h.location?.coordinates?.[0],
          address: h.location?.address || ''
        },
        matchedBloodType: bloodType || null,
        availableUnits: avail,
        hasSufficientStock: avail >= requestedUnits,
        allStock: h.bloodStock
      };
    });

    return res.status(200).json({
      success: true,
      count: formattedResults.length,
      hospitals: formattedResults
    });
  } catch (error) {
    next(error);
  }
};