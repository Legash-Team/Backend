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

// GET /api/hospital/donation-records
exports.listHospitalRecords = async (req, res, next) => {
  try {
    const records = await DonationRecord.find({ hospital: req.user.id })
      .sort({ donationDate: -1, createdAt: -1 })
      .populate('donor', 'name shortId bloodType')
      .populate('bloodRequest', 'bloodType status requestType');

    const formattedRecords = records.map((r) => ({
      id: r._id.toString(),
      requestId: r.bloodRequest?._id?.toString() || null,
      responseId: r.bloodRequestResponse?.toString() || null,
      donorName: r.donor?.name || 'Anonymous Donor',
      donorId: r.donor?.shortId || r.donor?._id?.toString() || '',
      bloodType: r.donorBloodType || r.requestBloodType || null,
      unitsCollected: r.unitsCollected || 1,
      donatedOn: r.donationDate ? r.donationDate.toISOString() : r.createdAt.toISOString(),
      screening: r.screening || {
        hiv: 'pending',
        hepatitisB: 'pending',
        hepatitisC: 'pending',
        syphilis: 'pending',
        malaria: 'pending',
      },
      vitals: {
        hemoglobin: r.hemoglobin ?? null,
        pulse: r.pulse ?? null,
        systolic: r.systolic ?? null,
        diastolic: r.diastolic ?? null,
        temperature: r.temperature ?? null,
      },
      outcome: r.outcome,
      notes: r.notes || r.healthIssues || '',
      recordedBy: r.recordedBy || 'Hospital Staff',
      recordedAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
    }));

    return res.status(200).json({
      success: true,
      records: formattedRecords,
      data: formattedRecords,
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/hospital/donation-records/:id
exports.deleteRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await DonationRecord.findOneAndDelete({
      _id: id,
      hospital: req.user.id,
    });

    if (!record) {
      return res.status(404).json({ success: false, error: 'Donation record not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Donation record deleted.',
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/hospital/donation-records
exports.createRecord = async (req, res, next) => {
  try {
    const {
      bloodRequestId: rawReqId,
      requestId,
      bloodRequestResponseId: rawRespId,
      responseId,
      outcome,
      donationDate: rawDate,
      donatedOn,
      donorBloodType: rawDonorBloodType,
      bloodType,
      pulse: rawPulse,
      hemoglobin: rawHgb,
      healthIssues,
      notes,
      thankYouMessage,
      unitsCollected,
      systolic: rawSys,
      diastolic: rawDia,
      temperature: rawTemp,
      screening,
      vitals,
      recordedBy
    } = req.body;

    const bloodRequestId = bloodRequestIdParam(rawReqId, requestId);
    const bloodRequestResponseId = bloodRequestResponseIdParam(rawRespId, responseId);
    const donationDate = rawDate || donatedOn || new Date().toISOString();

    if (!['donated', 'did_not_donate'].includes(outcome)) {
      return res.status(400).json({ success: false, error: 'Invalid outcome value.' });
    }

    if (!donationDate || new Date(donationDate) > new Date(Date.now() + 5 * 60 * 1000)) {
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
      response.bloodRequest.toString() !== bloodRequestId.toString() ||
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
      requestBloodType: request.bloodType, // Injected from DB, not client
      recordedBy: recordedBy ? String(recordedBy).trim() : 'Hospital Staff',
      notes: notes || healthIssues || null,
      screening: screening || {
        hiv: 'pending',
        hepatitisB: 'pending',
        hepatitisC: 'pending',
        syphilis: 'pending',
        malaria: 'pending'
      }
    };

    if (outcome === 'donated') {
      const resolvedBloodType = rawDonorBloodType || bloodType || request.bloodType;
      if (!resolvedBloodType || !VALID_BLOOD_TYPES.includes(resolvedBloodType)) {
        return res
          .status(400)
          .json({ success: false, error: 'Valid donorBloodType is required for donations.' });
      }
      recordPayload.donorBloodType = resolvedBloodType;
      recordPayload.unitsCollected = unitsCollected ? Number(unitsCollected) : 1;
      recordPayload.pulse = rawPulse ?? vitals?.pulse ?? null;
      recordPayload.hemoglobin = rawHgb ?? vitals?.hemoglobin ?? null;
      recordPayload.systolic = rawSys ?? vitals?.systolic ?? null;
      recordPayload.diastolic = rawDia ?? vitals?.diastolic ?? null;
      recordPayload.temperature = rawTemp ?? vitals?.temperature ?? null;
      recordPayload.healthIssues = healthIssues || notes || null;
      recordPayload.thankYouMessage = thankYouMessage || null;
    }
    // If did_not_donate: clinical donation fields are omitted

    const record = await DonationRecord.create(recordPayload);

    // Update lastDonatedAt only on 'donated'
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

function bloodRequestIdParam(a, b) {
  return a || b;
}

function bloodRequestResponseIdParam(a, b) {
  return a || b;
}

// GET /api/donor/donation-history
exports.getMyDonationHistory = async (req, res, next) => {
  try {
    const records = await DonationRecord.find({ donor: req.user.id })
      .sort({ donationDate: -1 })
      .populate('hospital', 'hospitalName location')
      .select('-__v');

    const mapped = records.map((rec) => {
      const units = rec.unitsCollected || 1;
      const quantityMl = units * 450;
      const bloodType = rec.donorBloodType || rec.requestBloodType || 'Unknown';
      const status = rec.outcome === 'donated' ? 'completed' : 'cancelled';
      const hospitalName = rec.hospital?.hospitalName || 'Blood Center';
      const centerAddress = rec.hospital?.location?.address || '';

      return {
        id: rec._id,
        _id: rec._id,
        outcome: rec.outcome,
        status,
        donationDate: rec.donationDate,
        donatedAt: rec.donationDate,
        requestBloodType: rec.requestBloodType,
        donorBloodType: rec.donorBloodType,
        bloodType,
        unitsCollected: units,
        quantity: quantityMl,
        quantityMl,
        hospitalName,
        centerName: hospitalName,
        centerAddress,
        thankYouMessage: rec.thankYouMessage,
        note: rec.thankYouMessage || rec.notes || null,
      };
    });

    return res.status(200).json({
      success: true,
      records: mapped,
      donations: mapped,
    });
  } catch (error) {
    next(error);
  }
};
