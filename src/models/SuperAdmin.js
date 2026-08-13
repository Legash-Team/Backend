// ONE document of this model should ever exist, created only by
// src/seed/seedSuperAdmin.js. No registration endpoint exists or should ever exist for this.

const mongoose = require('mongoose');

const superAdminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  resetCode: { type: String, default: null },
  resetCodeExpiresAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('SuperAdmin', superAdminSchema);