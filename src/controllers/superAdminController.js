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
    const { reason } = req.body || {};

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
    hospital.rejectionReason = reason || null;
    await hospital.save();

    try {
      if (reason) {
        await emailService.sendRejectionEmail(hospital.email, reason);
      } else {
        await emailService.sendRejectionEmail(hospital.email);
      }
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

// Feedbacks Management
exports.listFeedbacks = async (req, res, next) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: feedbacks
    });
  } catch (error) {
    next(error);
  }
};

// Events Management
exports.createEvent = async (req, res, next) => {
  try {
    const { title, description, mediaUrl, mediaType, applicationLink, closesAt } = req.body;

    if (!title || !description || !closesAt) {
      return res.status(400).json({
        success: false,
        error: 'Title, description, and closesAt timestamp are required.'
      });
    }

    const event = await EventPost.create({
      title,
      description,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      applicationLink: applicationLink || null,
      closesAt: new Date(closesAt),
      createdBy: req.user?.id
    });

    return res.status(201).json({
      success: true,
      message: 'Event posted successfully.',
      data: event
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
      data: events
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
      message: 'Event deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// Sub-Admin RBAC Creation & Management
exports.createSubAdmin = async (req, res, next) => {
  try {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and role are required.'
      });
    }

    let permissions = [];
    if (role === 'can_approve_hospitals') {
      permissions = ['can_approve_hospitals'];
    } else if (role === 'can_post_events') {
      permissions = ['can_post_events'];
    } else if (role === 'both') {
      permissions = ['can_approve_hospitals', 'can_post_events'];
    } else if (Array.isArray(role)) {
      permissions = role;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Options: can_approve_hospitals, can_post_events, both'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await AdminUser.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An admin with this email already exists.'
      });
    }

    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const adminUser = await AdminUser.create({
      name,
      email: cleanEmail,
      permissions,
      invitationToken,
      invitationExpiresAt,
      isActive: false
    });

    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/setup-password?token=${invitationToken}`;
    try {
      await emailService.sendAdminInvitationEmail(cleanEmail, invitationLink, permissions);
    } catch (e) {
      console.warn('⚠️ SMTP Error:', e.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Admin invitation sent successfully.',
      adminId: adminUser._id,
      invitationToken: invitationToken,
      token: invitationToken,
      data: {
        adminId: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        permissions: adminUser.permissions,
        invitationToken: invitationToken
      }
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

    const formatted = subAdmins.map(admin => ({
      id: admin._id,
      name: admin.name,
      email: admin.email,
      permissions: admin.permissions,
      isActive: admin.isActive,
      createdAt: admin.createdAt
    }));

    return res.status(200).json({
      success: true,
      subAdmins: formatted,
      data: formatted
    });
  } catch (error) {
    next(error);
  }
};

exports.acceptSubAdminInvitation = async (req, res, next) => {
  try {
    const token = req.body.token || req.body.invitationToken;
    const password = req.body.password || req.body.newPassword;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required.'
      });
    }

    const admin = await AdminUser.findOne({
      invitationToken: token,
      invitationExpiresAt: { $gt: new Date() }
    });

    if (!admin) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired invitation token.'
      });
    }

    admin.passwordHash = await hashPassword(password);
    admin.invitationToken = null;
    admin.invitationExpiresAt = null;
    admin.isActive = true;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: 'Admin account password configured. You can now log in.'
    });
  } catch (error) {
    next(error);
  }
};