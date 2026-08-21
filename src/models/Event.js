// Backend/src/models/Event.js
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: 'Legash Blood Donation Event',
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video', null],
      default: 'image',
    },
    applyLink: {
      type: String,
      default: null,
    },
    closesAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'creatorModel',
    },
    creatorModel: {
      type: String,
      enum: ['SuperAdmin', 'Admin'],
      default: 'SuperAdmin',
    },
  },
  { timestamps: true }
);

eventSchema.pre('save', function (next) {
  if (this.closesAt && new Date(this.closesAt) <= new Date()) {
    this.status = 'closed';
  } else {
    this.status = 'open';
  }
  next();
});

module.exports = mongoose.model('Event', eventSchema);
