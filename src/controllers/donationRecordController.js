const DonationRecord = require('../models/DonationRecord');
const BloodRequest = require('../models/BloodRequest');
const BloodRequestResponse = require('../models/BloodRequestResponse');
const Donor = require('../models/Donor');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');

// GET /api/hospital/donation-records/accepted
exports.listAcceptedDonors = async (req, res, next) => {
  try {
    const closedRequests = await BloodRequest.find({
      hospital: req.user.id,
      status: 'closed'
    }).select('_id');

    const closedRequestIds = closedRequests.map((r) => r._id);

    // Find accepted responses on closed requests
    const acceptedResponses = await BloodRequestResponse.find({
      bloodRequest: { $in: closedRequestIds },
      status: 'accepted'
    }).populate('donor', 'name phone bloodType shortId');

    // Exclude responses that already have a donation record
    const existingRecords = await DonationRecord.find({
      bloodRequestResponse: { $in: acceptedResponses.map((r) => r._id) }
    }).select('bloodRequestResponse');

    const recordedResponseIds = new Set(
      existingRecords.map((rec) => rec.bloodRequestResponse.toString())
    );

    const pendingRecordResponses = acceptedResponses.filter(
      (r) => !recordedResponseIds.has(r._id.toString())
    );

    return res.status(200).json({
      success: true,
      data: pendingRecordResponses
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/hospital/donation-records
exports.createRecord = async (req, res, next) => {
  try {
    const {
      bloodRequestId,
      bloodRequestResponseId,
      outcome,
      donationDate,
      donorBloodType,
      pulse,
      hemoglobin,
      healthIssues,
      thankYouMessage
    } = req.body;

    if (!['donated', 'did_not_donate'].includes(outcome)) {
      return res.status(400).json({ success: false, error: 'Invalid outcome value.' });
    }

    if (!donationDate || new Date(donationDate) > new Date()) {
      return res
        .status(400)
        .json({ success: false, error: 'Donation date cannot be in the future.' });
    }

    const request = await BloodRequest.findById(bloodRequestId);
    if (!request || request.hospital.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized blood request access.' });
    }

    if (request.status !== 'closed') {
      return res
        .status(400)
        .json({ success: false, error: 'Cannot record outcome on an open request.' });
    }

    const response = await BloodRequestResponse.findById(bloodRequestResponseId);
    if (
      !response ||
      response.bloodRequest.toString() !== bloodRequestId ||
      response.status !== 'accepted'
    ) {
      return res.status(400).json({ success: false, error: 'Donor did not accept this request.' });
    }

    // Check duplicate record (409 Conflict)
    const exists = await DonationRecord.findOne({ bloodRequestResponse: bloodRequestResponseId });
    if (exists) {
      return res
        .status(409)
        .json({ success: false, error: 'Record already exists for this donor response.' });
    }

    const recordPayload = {
      bloodRequest: request._id,
      bloodRequestResponse: response._id,
      donor: response.donor,
      hospital: req.user.id,
      outcome,
      donationDate: new Date(donationDate),
      requestBloodType: request.bloodType // Injected from DB, not client
    };

    if (outcome === 'donated') {
      if (!donorBloodType || !VALID_BLOOD_TYPES.includes(donorBloodType)) {
        return res
          .status(400)
          .json({ success: false, error: 'Valid donorBloodType is required for donations.' });
      }
      recordPayload.donorBloodType = donorBloodType;
      recordPayload.pulse = pulse ? Number(pulse) : null;
      recordPayload.hemoglobin = hemoglobin ? Number(hemoglobin) : null;
      recordPayload.healthIssues = healthIssues || null;
      recordPayload.thankYouMessage = thankYouMessage || null;
    }
    // If did_not_donate: health fields are completely omitted

    const record = await DonationRecord.create(recordPayload);

    // Feature B3 integration hook: Update lastDonatedAt only on 'donated'
    if (outcome === 'donated') {
      await Donor.findByIdAndUpdate(response.donor, {
        lastDonatedAt: new Date(donationDate)
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Donation record created successfully.',
      record
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Record already exists.' });
    }
    next(error);
  }
};

// GET /api/donor/donation-history
exports.getMyDonationHistory = async (req, res, next) => {
  try {
    const records = await DonationRecord.find({ donor: req.user.id })
      .sort({ donationDate: -1 })
      .populate('hospital', 'hospitalName')
      .select('-__v');

    return res.status(200).json({
      success: true,
      records: records.map((rec) => ({
        id: rec._id,
        outcome: rec.outcome,
        donationDate: rec.donationDate,
        requestBloodType: rec.requestBloodType,
        donorBloodType: rec.donorBloodType,
        hospitalName: rec.hospital?.hospitalName || 'Hospital',
        thankYouMessage: rec.thankYouMessage
      }))
    });
  } catch (error) {
    next(error);
  }
};
