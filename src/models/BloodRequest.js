const mongoose = require('mongoose');

const bloodRequestSchema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    required: true,
  },
  quantityNeeded: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  closedReason: { type: String, enum: ['manual', 'auto-expired', null], default: null },
  closesAt: { type: Date, required: true },
  closedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

bloodRequestSchema.index({ status: 1, closesAt: 1 });

module.exports = mongoose.model('BloodRequest', bloodRequestSchema);