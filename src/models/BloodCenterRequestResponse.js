// Backend/src/models/BloodCenterRequestResponse.js
const mongoose = require('mongoose');

const bloodCenterRequestResponseSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodCenterRequest',
      required: true
    },
    bloodCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'denied'],
      default: 'pending'
    },
    respondedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

bloodCenterRequestResponseSchema.index({ request: 1, bloodCenter: 1 }, { unique: true });
bloodCenterRequestResponseSchema.index({ bloodCenter: 1, status: 1 });

module.exports = mongoose.model('BloodCenterRequestResponse', bloodCenterRequestResponseSchema);
