const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  licenseNumber: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
    address: String
  },
  isEmailVerified: { type: Boolean, default: false },
  isApprovedByAdmin: { type: Boolean, default: false } // Starts as "pending"
}, { timestamps: true });

hospitalSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Hospital', hospitalSchema);