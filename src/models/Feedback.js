const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  hospitalEmail: { type: String, required: true, trim: true, lowercase: true },
  hospitalName: { type: String, required: true, trim: true },
  subject: { type: String, default: 'Hospital Registration Appeal' },
  message: { type: String, required: true, trim: true },
  rejectionReasonGiven: { type: String, default: null },
  isReviewed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Feedback', feedbackSchema);