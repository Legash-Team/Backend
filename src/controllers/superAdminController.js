const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const emailService = require('../services/emailService');

exports.listPendingHospitals = async (req, res, next) => {
  try {
    const hospitals = await Hospital.find({
      verificationStatus: 'pending',
      emailVerified: true
    });

    const formattedHospitals = hospitals.map(hospital => {
      const lat = hospital.location?.coordinates?.[1] ?? 0;
      const lng = hospital.location?.coordinates?.[0] ?? 0;

      return {
        id: hospital._id,
        hospitalName: hospital.hospitalName,
        email: hospital.email,
        phone: hospital.phone,
        licenseNumber: hospital.licenseNumber,
        location: { lat, lng },
        registeredAt: hospital.createdAt
      };
    });

    return res.status(200).json({
      success: true,
      hospitals: formattedHospitals
    });
  } catch (error) {
    next(error);
  }
};

exports.approveHospital = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'This hospital is not pending approval.'
      });
    }

    const hospital = await Hospital.findById(id);

    if (!hospital || hospital.verificationStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'This hospital is not pending approval.'
      });
    }

    hospital.verificationStatus = 'approved';
    await hospital.save();

    try {
      await emailService.sendApprovalEmail(hospital.email);
    } catch (emailErr) {
      console.warn('⚠️ SMTP Error sending approval email:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Hospital approved. They have been notified and can now log in.'
    });
  } catch (error) {
    next(error);
  }
};

exports.rejectHospital = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'This hospital is not pending approval.'
      });
    }

    const hospital = await Hospital.findById(id);

    if (!hospital || hospital.verificationStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'This hospital is not pending approval.'
      });
    }

    hospital.verificationStatus = 'rejected';
    await hospital.save();

    try {
      await emailService.sendRejectionEmail(hospital.email);
    } catch (emailErr) {
      console.warn('⚠️ SMTP Error sending rejection email:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Hospital rejected. They have been notified.'
    });
  } catch (error) {
    next(error);
  }
};
