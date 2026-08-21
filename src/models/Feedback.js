const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    hospitalName: {
      type: String,
      trim: true,
      default: 'Hospital',
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['new', 'reviewed', 'closed'],
      default: 'new',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
