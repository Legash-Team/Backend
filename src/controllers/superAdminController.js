const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const Feedback = require('../models/Feedback');
const Event = require('../models/Event');
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
    const { reason, rejectionReason } = req.body || {};
    const finalReason = (reason || rejectionReason || '').toString().trim();

    // 1. Status and existence validation first
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

    // 2. Rejection reason required for pending hospital
    if (!finalReason) {
      return res.status(400).json({
        success: false,
        error: 'A rejection reason is required.'
      });
    }

    hospital.verificationStatus = 'rejected';
    hospital.rejectionReason = finalReason;
    await hospital.save();

    try {
      await emailService.sendRejectionEmail(hospital.email, finalReason);
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

exports.listFeedbacks = async (req, res, next) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      feedbacks
    });
  } catch (error) {
    next(error);
  }
};

exports.markFeedbackReviewed = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: 'Feedback not found.' });
    }

    const feedback = await Feedback.findByIdAndUpdate(id, { status: 'reviewed' }, { new: true });
    if (!feedback) {
      return res.status(404).json({ success: false, error: 'Feedback not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Feedback marked as reviewed.',
      feedback
    });
  } catch (error) {
    next(error);
  }
};

exports.createEvent = async (req, res, next) => {
  try {
    const { mediaUrl, mediaType, description, applyLink, closesAt } = req.body;

    if (!description || !closesAt) {
      return res.status(400).json({
        success: false,
        error: 'Description and closesAt timestamp are required.'
      });
    }

    const event = await Event.create({
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || 'image',
      description: description.trim(),
      applyLink: applyLink || null,
      closesAt: new Date(closesAt),
      createdBy: req.user?.id,
      creatorModel: 'SuperAdmin'
    });

    return res.status(201).json({
      success: true,
      message: 'Event posted successfully.',
      event
    });
  } catch (error) {
    next(error);
  }
};

exports.listAdminEvents = async (req, res, next) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      events
    });
  } catch (error) {
    next(error);
  }
};
