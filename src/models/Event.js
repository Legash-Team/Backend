const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  eventDate: { type: Date, required: true },
  location: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
