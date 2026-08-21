const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    mediaUrl: {
      type: String,
      default: null,
      trim: true,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    applyLink: {
      type: String,
      default: null,
      trim: true,
    },
    closesAt: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'creatorModel',
      default: null,
    },
    creatorModel: {
      type: String,
      enum: ['SuperAdmin', 'Admin'],
      default: 'SuperAdmin',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual getter for dynamically calculated status
eventSchema.virtual('status').get(function () {
  if (!this.closesAt) return 'open';
  return new Date() < new Date(this.closesAt) ? 'open' : 'closed';
});

module.exports = mongoose.model('Event', eventSchema);
