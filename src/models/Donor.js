const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, required: true, unique: true, trim: true },
  fin: { type: String, required: true, trim: true },
  gender: { type: String, required: true, enum: ['male', 'female'] },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'],
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  dob: { type: Date },
  phoneVerified: { type: Boolean, default: false },
  agreedToTerms: { type: Boolean, required: true },
  resetCode: { type: String, default: null },
  resetCodeExpiresAt: { type: Date, default: null },
}, { timestamps: true });

donorSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Donor', donorSchema);
