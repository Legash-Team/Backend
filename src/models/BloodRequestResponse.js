const mongoose = require('mongoose');

const bloodRequestResponseSchema = new mongoose.Schema({
  bloodRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'denied'], default: 'pending' },
  notifiedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
}, { timestamps: true });

bloodRequestResponseSchema.index({ donor: 1, status: 1 });
bloodRequestResponseSchema.index({ bloodRequest: 1, donor: 1 }, { unique: true });

module.exports = mongoose.model('BloodRequestResponse', bloodRequestResponseSchema);