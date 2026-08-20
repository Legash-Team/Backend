// Backend/src/models/Hospital.js
const mongoose = require('mongoose');

const bloodStockSchema = new mongoose.Schema(
  {
    bloodType: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      required: true,
    },
    availableUnits: {
      type: Number,
      required: true,
      min: [0, 'Available units cannot be negative'],
      default: 0,
    },
    reservedUnits: {
      type: Number,
      default: 0,
      min: 0,
    },
    minimumUnits: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    _id: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

bloodStockSchema
  .virtual('quantity')
  .get(function () {
    return (this.availableUnits || 0) + (this.reservedUnits || 0);
  })
  .set(function (val) {
    if (val < 0) {
      this.invalidate('quantity', 'Quantity cannot be negative');
    }
    this.availableUnits = val;
    this.reservedUnits = 0;
  });

const DEFAULT_BLOOD_STOCK = [
  { bloodType: 'A+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'A-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'B+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'B-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'AB+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'AB-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'O+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'O-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
];

const hospitalSchema = new mongoose.Schema(
  {
    hospitalName: { type: String, required: true, trim: true },
    licenseNumber: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: { type: [Number], required: true },
      address: String,
    },
    emailVerified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: { type: String, default: null },
    verificationOtp: { type: String, default: null },
    verificationOtpExpiresAt: { type: Date, default: null },
    verificationOtpLastSentAt: { type: Date, default: null },
    pendingEmail: { type: String, default: null },
    pendingEmailOtp: { type: String, default: null },
    pendingEmailOtpExpiresAt: { type: Date, default: null },
    agreedToTerms: { type: Boolean, default: true },
    resetCode: { type: String, default: null },
    resetCodeExpiresAt: { type: Date, default: null },
    bloodStock: {
      type: [bloodStockSchema],
      default: DEFAULT_BLOOD_STOCK,
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

hospitalSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Hospital', hospitalSchema);