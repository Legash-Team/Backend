const mongoose = require('mongoose');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');

const hospitalStockSnapshotSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true
    },
    bloodType: {
      type: String,
      enum: VALID_BLOOD_TYPES,
      required: true
    },
    availableUnits: {
      type: Number,
      required: true,
      min: 0
    },
    recordedAt: {
      type: Date,
      required: true
    }
  },
  {
    versionKey: false,
    timestamps: false
  }
);

hospitalStockSnapshotSchema.index({ recordedAt: -1 });
hospitalStockSnapshotSchema.index({ bloodType: 1, recordedAt: -1 });
hospitalStockSnapshotSchema.index({ hospital: 1, recordedAt: -1 });

module.exports = mongoose.model('HospitalStockSnapshot', hospitalStockSnapshotSchema);
