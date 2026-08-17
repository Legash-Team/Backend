const mongoose = require('mongoose');

const bloodStockSchema = new mongoose.Schema({
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    required: true
  },
  availableUnits: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  reservedUnits: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  minimumUnits: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  _id: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ★ VIRTUAL FIELD: Automatically calculates total quantity (available + reserved)
bloodStockSchema.virtual('quantity').get(function () {
  return (this.availableUnits || 0) + (this.reservedUnits || 0);
});

const DEFAULT_BLOOD_STOCK = [
  { bloodType: 'A+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'A-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'B+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'B-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'AB+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'AB-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'O+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
  { bloodType: 'O-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 }
];

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  licenseNumber: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true },
    address: String
  },
  isEmailVerified: { type: Boolean, default: false },
  isApprovedByAdmin: { type: Boolean, default: false },
  bloodStock: {
    type: [bloodStockSchema],
    default: DEFAULT_BLOOD_STOCK
  }
}, { timestamps: true });

hospitalSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Hospital', hospitalSchema);