// Backend/src/models/BloodCenterRequest.js
const mongoose = require('mongoose');

const bloodCenterRequestSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
      index: true
    },
    bloodType: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      required: true
    },
    quantityNeeded: {
      type: Number,
      required: true,
      min: [1, 'Quantity needed must be at least 1']
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, 'Note cannot exceed 500 characters'],
      default: ''
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open'
    },
    closesAt: {
      type: Date,
      required: true
    },
    closedAt: {
      type: Date,
      default: null
    },
    closedReason: {
      type: String,
      enum: ['manual', 'expired', 'fulfilled', null],
      default: null
    }
  },
  { timestamps: true }
);

bloodCenterRequestSchema.index({ hospital: 1, createdAt: -1 });
bloodCenterRequestSchema.index({ status: 1, closesAt: 1 });

module.exports = mongoose.model('BloodCenterRequest', bloodCenterRequestSchema);
