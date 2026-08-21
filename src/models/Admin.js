const mongoose = require('mongoose');

const adminPermissionsSchema = new mongoose.Schema({
  canApproveHospitals: {
    type: Boolean,
    default: false
  },
  canPostEvents: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationOtp: {
    type: String,
    default: null
  },
  verificationOtpExpiresAt: {
    type: Date,
    default: null
  },
  permissions: {
    type: adminPermissionsSchema,
    default: () => ({ canApproveHospitals: false, canPostEvents: false })
  }
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);
