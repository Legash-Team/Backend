// Backend/src/models/Donor.js
const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    fin: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['male', 'female'], default: 'male' },
    bloodType: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'],
      default: 'unknown',
    },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    phoneVerified: { type: Boolean, default: false },
    pinHash: { type: String, default: null },
    pinSetAt: { type: Date, default: null },
    dob: { type: Date, default: null },
    weightKg: { type: Number, default: null },
    heightCm: { type: Number, default: null },
    healthNotes: { type: String, default: '' },
    pushToken: { type: String, default: null },
    pendingPhone: { type: String, default: null },
    pendingPhoneOtp: { type: String, default: null },
    pendingPhoneOtpExpiresAt: { type: Date, default: null },
    agreedToTerms: { type: Boolean, default: true },
    resetCode: { type: String, default: null },
    resetCodeExpiresAt: { type: Date, default: null },
    lastOtpSentAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

donorSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Donor', donorSchema);