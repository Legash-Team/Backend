// Backend/src/controllers/superAdminController.js
const crypto = require('crypto');
const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const Feedback = require('../models/Feedback');
const EventPost = require('../models/EventPost');
const AdminUser = require('../models/AdminUser');
const emailService = require('../services/emailService');
const { hashPassword } = require('../utils/hashPassword');

exports.listPendingHospitals = async (req, res, next) => {
  try {
    const hospitals = await Hospital.find({
      verificationStatus: 'pending',
      emailVerified: true,
      isDeleted: { $ne: true },
    });

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

    if (!reason || reason.trim().length === 0) {
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
    const feedback = await Feedback.findByIdAndUpdate(id, { isReviewed: true }, { new: true });
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
    const { title, description, mediaUrl, mediaType, applyLink, applicationLink, closesAt } = req.body;

    if (!description || !closesAt) {
      return res.status(400).json({
        success: false,
        error: 'Description and closesAt timestamp are required.',
      });
    }

    const event = await EventPost.create({
      title: title || 'Legash Event',
      description: description.trim(),
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || 'image',
      applicationLink: applyLink || applicationLink || null,
      closesAt: new Date(closesAt),
      createdBy: req.user?.id,
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
    const events = await EventPost.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    await EventPost.findByIdAndDelete(id);
    return res.status(200).json({
      success: true,
      message: 'Event deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

exports.createSubAdmin = async (req, res, next) => {
  try {
    const { name, email, permissions } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required.',
      });
    }

    let parsedPermissions = [];
    if (permissions && typeof permissions === 'object') {
      if (permissions.canApproveHospitals) parsedPermissions.push('can_approve_hospitals');
      if (permissions.canPostEvents) parsedPermissions.push('can_post_events');
    } else if (Array.isArray(permissions)) {
      parsedPermissions = permissions;
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await AdminUser.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An admin with this email already exists.',
      });
    }

    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const adminUser = await AdminUser.create({
      name: name.trim(),
      email: cleanEmail,
      permissions: parsedPermissions,
      invitationToken,
      invitationExpiresAt,
      isActive: false,
    });

    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/setup?token=${invitationToken}`;
    try {
      await emailService.sendAdminInvitationEmail(cleanEmail, invitationLink, parsedPermissions);
    } catch (e) {
      console.warn('⚠️ SMTP Error:', e.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Admin invitation sent successfully.',
      admin: {
        id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        permissions: adminUser.permissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listSubAdmins = async (req, res, next) => {
  try {
    const subAdmins = await AdminUser.find({ isDeleted: { $ne: true } })
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    const formatted = subAdmins.map((admin) => ({
      id: admin._id,
      name: admin.name,
      email: admin.email,
      permissions: admin.permissions,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    }));

    return res.status(200).json({
      success: true,
      admins: formatted,
    });
  } catch (error) {
    next(error);
  }
};

exports.acceptSubAdminInvitation = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and password are required.',
      });
    }

    const admin = await AdminUser.findOne({
      invitationToken: token,
      invitationExpiresAt: { $gt: new Date() },
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired invitation token.',
      });
    }

    admin.passwordHash = await hashPassword(password);
    admin.invitationToken = null;
    admin.invitationExpiresAt = null;
    admin.isActive = true;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: 'Admin account password configured. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
};