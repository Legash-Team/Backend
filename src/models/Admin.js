const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      default: undefined
    },
    address: {
      type: String,
      trim: true
    }
  },
  { _id: false }
);

const adminSchema = new mongoose.Schema(
  {
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
    centerName: {
      type: String,
      trim: true,
      default: null
    },
    phone: {
      type: String,
      trim: true,
      default: null
    },
    location: {
      type: pointSchema,
      default: undefined
    },
    termsAccepted: {
      type: Boolean,
      default: false
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
    setupToken: {
      type: String,
      default: null
    },
    setupTokenExpiresAt: {
      type: Date,
      default: null
    },
    permissions: {
      canApproveHospitals: {
        type: Boolean,
        default: false
      },
      canPostEvents: {
        type: Boolean,
        default: false
      }
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuperAdmin',
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

adminSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Admin', adminSchema);
