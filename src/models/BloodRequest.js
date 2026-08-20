// Backend/src/models/BloodRequest.js
const mongoose = require('mongoose');

const bloodRequestSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
    },
    bloodType: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      required: true,
    },
    quantityNeeded: {
      type: Number,
      required: true,
      min: [1, 'Quantity needed must be at least 1'],
    },
    isEmergency: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['open', 'fulfilled', 'closed'],
      default: 'open',
    },
    closesAt: {
      type: Date,
      required: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedReason: {
      type: String,
      enum: ['fulfilled', 'cancelled', 'expired', 'manual', null],
      default: null,
    },
  },
  { timestamps: true }
);

bloodRequestSchema.index({ status: 1, closesAt: 1 });

module.exports = mongoose.model('BloodRequest', bloodRequestSchema);