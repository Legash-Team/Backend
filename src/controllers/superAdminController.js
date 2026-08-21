// Backend/src/controllers/superAdminController.js
const crypto = require('crypto');
const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const Feedback = require('../models/Feedback');
const Event = require('../models/Event');
const Admin = require('../models/Admin');
const emailService = require('../services/emailService');
const { hashPassword } = require('../utils/hashPassword');

exports.listPendingHospitals = async (req, res, next) => {
  try {
    const hospitals = await Hospital.find({
      verificationStatus: 'pending',
      emailVerified: true,
      isDeleted: { $ne: true },
    }).sort({ createdAt: -1 });

    const formattedHospitals = hospitals.map((hospital) => {
      const lat = hospital.location?.coordinates?.[1] ?? 0;
      const lng = hospital.location?.coordinates?.[0] ?? 0;

      return {
        id: hospital._id,
        hospitalName: hospital.hospitalName,
        email: hospital.email,
        phone: hospital.phone,
        licenseNumber: hospital.licenseNumber,
        location: { lat, lng },
        registeredAt: hospital.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      hospitals: formattedHospitals,
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
        error: 'This hospital is not pending approval.',
      });
    }

    const hospital = await Hospital.findById(id);

    if (!hospital || hospital.verificationStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'This hospital is not pending approval.',
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
      message: 'Hospital approved. They have been notified and can now log in.',
    });
  } catch (error) {
    next(error);
  }
};

exports.rejectHospital = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A rejection reason is required.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'This hospital is not pending approval.',
      });
    }

    const hospital = await Hospital.findById(id);

    if (!hospital || hospital.verificationStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'This hospital is not pending approval.',
      });
    }

    hospital.verificationStatus = 'rejected';
    hospital.rejectionReason = reason.trim();
    await hospital.save();

    try {
      await emailService.sendRejectionEmail(hospital.email, reason.trim());
    } catch (emailErr) {
      console.warn('⚠️ SMTP Error sending rejection email:', emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Hospital rejected. They have been notified.',
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
      feedbacks,
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
      feedback,
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
        error: 'Description and closesAt timestamp are required.',
      });
    }

    const event = await Event.create({
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || 'image',
      description: description.trim(),
      applyLink: applyLink || null,
      closesAt: new Date(closesAt),
      createdBy: req.user?.id,
      creatorModel: req.user?.role === 'superadmin' ? 'SuperAdmin' : 'Admin',
    });

    return res.status(201).json({
      success: true,
      message: 'Event posted successfully.',
      event,
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
      events,
    });
  } catch (error) {
    next(error);
  }
};

exports.createAdmin = async (req, res, next) => {
  try {
    const { name, email, permissions } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await Admin.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An admin with this email already exists.',
      });
    }

    const canApproveHospitals = Boolean(permissions?.canApproveHospitals);
    const canPostEvents = Boolean(permissions?.canPostEvents);

    const setupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const admin = await Admin.create({
      name: name.trim(),
      email: cleanEmail,
      permissions: {
        canApproveHospitals,
        canPostEvents,
      },
      setupToken,
      setupTokenExpiresAt,
      emailVerified: false,
      createdBy: req.user?.id,
    });

    try {
      await emailService.sendAdminSetupEmail(cleanEmail, setupToken, admin.permissions);
    } catch (e) {
      console.warn('⚠️ SMTP Error sending Admin setup email:', e.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Admin account created and setup invitation sent.',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        permissions: admin.permissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listAdmins = async (req, res, next) => {
  try {
    const admins = await Admin.find({ isDeleted: { $ne: true } })
      .select('-passwordHash -setupToken -setupTokenExpiresAt')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      admins,
    });
  } catch (error) {
    next(error);
  }
};

exports.setupAdminPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Setup token and new password are required.',
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Password confirmation does not match.',
      });
    }

    const admin = await Admin.findOne({
      setupToken: token.trim(),
      setupTokenExpiresAt: { $gt: new Date() },
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired setup token.',
      });
    }

    admin.passwordHash = await hashPassword(password);
    admin.setupToken = null;
    admin.setupTokenExpiresAt = null;
    admin.emailVerified = true;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: 'Password configured successfully. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
};