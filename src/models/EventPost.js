const mongoose = require('mongoose');

const eventPostSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  mediaUrl: { type: String, default: null },
  mediaType: { type: String, enum: ['image', 'video', null], default: null },
  applicationLink: { type: String, default: null },
  closesAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SuperAdmin' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

eventPostSchema.virtual('isOpen').get(function () {
  return new Date(this.closesAt) > new Date();
});

module.exports = mongoose.model('EventPost', eventPostSchema);