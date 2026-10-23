const mongoose = require('mongoose');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');

const donationRecordSchema = new mongoose.Schema(
  {
    bloodRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodRequest',
      required: true,
    },
    bloodRequestResponse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodRequestResponse',
      required: true,
      unique: true,
    },
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Donor',
      required: true,
    },
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
    },
    outcome: {
      type: String,
      enum: ['donated', 'did_not_donate'],
      required: true,
    },
    donationDate: {
      type: Date,
      required: true,
    },
    requestBloodType: {
      type: String,
      required: true,
    },
    donorBloodType: {
      type: String,
      enum: VALID_BLOOD_TYPES,
      default: null,
    },
    pulse: {
      type: Number,
      default: null,
    },
    hemoglobin: {
      type: Number,
      default: null,
    },
    healthIssues: {
      type: String,
      default: null,
    },
    thankYouMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DonationRecord', donationRecordSchema);
