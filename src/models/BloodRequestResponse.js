const mongoose = require('mongoose');

const bloodRequestResponseSchema = new mongoose.Schema({
  bloodRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'denied'], default: 'pending' },
  notifiedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
});

bloodRequestResponseSchema.index({ donor: 1, status: 1 });

module.exports = mongoose.model('BloodRequestResponse', bloodRequestResponseSchema);