const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: null },
  permissions: [{
    type: String,
    enum: ['can_approve_hospitals', 'can_post_events']
  }],
  invitationToken: { type: String, default: null },
  invitationExpiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', adminUserSchema);