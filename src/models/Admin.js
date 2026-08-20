// Backend/src/models/Admin.js
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    setupToken: {
      type: String,
      default: null,
    },
    setupTokenExpiresAt: {
      type: Date,
      default: null,
    },
    permissions: {
      canApproveHospitals: {
        type: Boolean,
        default: false,
      },
      canPostEvents: {
        type: Boolean,
        default: false,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuperAdmin',
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', adminSchema);