const crypto = require('crypto');
const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const Event = require('../models/Event');
const Admin = require('../models/Admin');
const Feedback = require('../models/Feedback');
const emailService = require('../services/emailService');
const generateResetCode = require('../utils/generateResetCode');
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

    if (!hospital || (hospital.verificationStatus !== 'pending' && hospital.verificationStatus !== 'rejected')) {
      return res.status(400).json({
        success: false,
        error: 'This hospital is not eligible for approval.',
      });
    }

    hospital.verificationStatus = 'approved';
    hospital.rejectionReason = null;
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
    const { reason, rejectionReason } = req.body || {};
    const finalReason = (reason || rejectionReason || '').toString().trim();

    // 1. Status and existence validation first
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

    // 2. Rejection reason required for pending hospital
    if (!finalReason) {
      return res.status(400).json({
        success: false,
        error: 'A rejection reason is required.',
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
    const { name, email, permissions, role } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const existingAdmin = await Admin.findOne({ email: cleanEmail });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        error: 'An Admin with this email already exists.',
      });
    }

    let parsedPermissions = {
      canApproveHospitals: false,
      canPostEvents: false,
    };

    if (permissions && typeof permissions === 'object') {
      parsedPermissions.canApproveHospitals = Boolean(permissions.canApproveHospitals);
      parsedPermissions.canPostEvents = Boolean(permissions.canPostEvents);
    } else if (typeof role === 'string') {
      const lowerRole = role.toLowerCase();
      if (lowerRole.includes('approve') || lowerRole === 'can approve hospitals') {
        parsedPermissions.canApproveHospitals = true;
      }
      if (lowerRole.includes('post') || lowerRole.includes('event') || lowerRole === 'can post events') {
        parsedPermissions.canPostEvents = true;
      }
      if (lowerRole.includes('both') || lowerRole === 'all') {
        parsedPermissions.canApproveHospitals = true;
        parsedPermissions.canPostEvents = true;
      }
    } else {
      if (req.body.canApproveHospitals !== undefined) {
        parsedPermissions.canApproveHospitals = Boolean(req.body.canApproveHospitals);
      }
      if (req.body.canPostEvents !== undefined) {
        parsedPermissions.canPostEvents = Boolean(req.body.canPostEvents);
      }
    }

    const { code, expiresAt } = generateResetCode ? generateResetCode() : {
      code: Math.floor(100000 + Math.random() * 900000).toString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };

    const admin = new Admin({
      name: name.trim(),
      email: cleanEmail,
      permissions: parsedPermissions,
      emailVerified: false,
      setupToken: code,
      setupTokenExpiresAt: expiresAt,
      passwordHash: null,
    });

    await admin.save();

    try {
      if (emailService.sendAdminSetupEmail) {
        // Must configure FRONTEND_URL in .env so it links to the correct place
        await emailService.sendAdminSetupEmail(cleanEmail, code, parsedPermissions);
      }
    } catch (emailErr) {
      console.warn('⚠️ SMTP Error sending admin setup email:', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Admin created successfully. Setup invitation has been sent.',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        permissions: admin.permissions,
        emailVerified: admin.emailVerified,
        createdAt: admin.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listAdmins = async (req, res, next) => {
  try {
    const admins = await Admin.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });

    const formattedAdmins = admins.map((admin) => ({
      id: admin._id,
      name: admin.name,
      email: admin.email,
      permissions: admin.permissions,
      emailVerified: admin.emailVerified,
      createdAt: admin.createdAt,
    }));

    return res.status(200).json({
      success: true,
      admins: formattedAdmins,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyAdminOtp = async (req, res, next) => {
  try {
    const { email, otp, code, verificationOtp } = req.body;
    const submittedOtp = (otp || code || verificationOtp || '').toString().trim();

    if (!email || !submittedOtp) {
      return res.status(400).json({
        success: false,
        error: 'Email and OTP are required.',
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const admin = await Admin.findOne({ email: cleanEmail });

    if (!admin) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email or OTP.',
      });
    }

    if (admin.emailVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified.',
      });
    }

    if (!admin.verificationOtp || admin.verificationOtp !== submittedOtp) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP.',
      });
    }

    if (admin.verificationOtpExpiresAt && admin.verificationOtpExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP.',
      });
    }

    admin.emailVerified = true;
    admin.verificationOtp = null;
    admin.verificationOtpExpiresAt = null;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: 'Admin email verified successfully. You can now set up your password.',
    });
  } catch (error) {
    next(error);
  }
};
exports.deleteAdmin = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found.' });
    }
    admin.isDeleted = true;
    await admin.save();
    return res.status(200).json({ success: true, message: 'Admin deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
