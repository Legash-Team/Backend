const mongoose = require('mongoose');
const DonationRecord = require('../models/DonationRecord');
const BloodRequest = require('../models/BloodRequest');
const BloodRequestResponse = require('../models/BloodRequestResponse');
const Donor = require('../models/Donor');
const Hospital = require('../models/Hospital');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');
const { sendDonationThankYou, sendDidNotDonateEncouragement } = require('../services/pushService');
const { sendDonationThankYouSms, sendDidNotDonateEncouragementSms } = require('../services/smsService');

// GET /api/hospital/donation-records/pending/count
exports.getPendingDonationCount = async (req, res, next) => {
  try {
    const hospitalRequests = await BloodRequest.find({
      hospital: req.user.id,
    }).select('_id');

    const hospitalRequestIds = hospitalRequests.map((r) => r._id);

    const acceptedResponses = await BloodRequestResponse.find({
      bloodRequest: { $in: hospitalRequestIds },
      status: 'accepted',
      donationOutcome: { $ne: 'did_not_donate' },
    }).populate('donor', '_id isDeleted');

    const orphanedResponseIds = acceptedResponses
      .filter((r) => !r.donor || r.donor.isDeleted)
      .map((r) => r._id);
    if (orphanedResponseIds.length > 0) {
      await BloodRequestResponse.deleteMany({ _id: { $in: orphanedResponseIds } }).catch(() => {});
    }

    // Exclude responses where donor was deleted or no longer exists
    const validResponses = acceptedResponses.filter(
      (r) => r.donor != null && !r.donor.isDeleted
    );

    const existingRecords = await DonationRecord.find({
      bloodRequestResponse: { $in: validResponses.map((r) => r._id) },
    }).select('bloodRequestResponse');

    const recordedResponseIds = new Set(
      existingRecords.map((rec) => rec.bloodRequestResponse.toString())
    );

    const pendingCount = validResponses.filter(
      (r) => !recordedResponseIds.has(r._id.toString())
    ).length;

    return res.status(200).json({
      success: true,
      count: pendingCount,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/hospital/donation-records/pending
exports.listPendingQueue = async (req, res, next) => {
  try {
    const hospitalRequests = await BloodRequest.find({
      hospital: req.user.id,
    }).select('_id');

    const hospitalRequestIds = hospitalRequests.map((r) => r._id);

    const acceptedResponses = await BloodRequestResponse.find({
      bloodRequest: { $in: hospitalRequestIds },
      status: 'accepted',
      donationOutcome: { $ne: 'did_not_donate' },
    })
      .populate('donor', 'name phone bloodType shortId email isDeleted')
      .populate('bloodRequest', 'bloodType requestType quantityNeeded isEmergency status description createdAt closesAt')
      .sort({ createdAt: 1 });

    const orphanedResponseIds = acceptedResponses
      .filter((r) => !r.donor || r.donor.isDeleted || !r.bloodRequest)
      .map((r) => r._id);

    if (orphanedResponseIds.length > 0) {
      await BloodRequestResponse.deleteMany({ _id: { $in: orphanedResponseIds } }).catch(() => {});
    }

    const validResponses = acceptedResponses.filter(
      (r) => r.donor != null && !r.donor.isDeleted && r.bloodRequest != null
    );

    const existingRecords = await DonationRecord.find({
      bloodRequestResponse: { $in: validResponses.map((r) => r._id) },
    }).select('bloodRequestResponse');

    const recordedResponseIds = new Set(
      existingRecords.map((rec) => rec.bloodRequestResponse.toString())
    );

    const pending = validResponses.filter(
      (r) => !recordedResponseIds.has(r._id.toString())
    );

    const queue = pending.map((r) => {
      const donorObj = r.donor;
      const requestObj = r.bloodRequest;
      return {
        id: r._id.toString(),
        shortId: donorObj.shortId || donorObj._id.toString(),
        name: donorObj.name,
        phone: donorObj.phone || '',
        bloodType: donorObj.bloodType || requestObj?.bloodType || '',
        acceptedRequest: requestObj?.bloodType ? `${requestObj.bloodType} Request` : 'Blood Request',
        bloodRequestId: requestObj?._id?.toString() || requestObj?.toString(),
        bloodRequestResponseId: r._id.toString(),
        responseId: r._id.toString(),
        donorId: donorObj._id.toString(),
        acceptedAt: r.respondedAt || r.createdAt,
        request: {
          id: requestObj?._id?.toString(),
          bloodType: requestObj?.bloodType,
          quantityNeeded: requestObj?.quantityNeeded,
          isEmergency: requestObj?.isEmergency,
          status: requestObj?.status,
          description: requestObj?.description,
          createdAt: requestObj?.createdAt,
        },
        donor: {
          id: donorObj._id.toString(),
          shortId: donorObj.shortId,
          name: donorObj.name,
          phone: donorObj.phone,
          bloodType: donorObj.bloodType,
        },
      };
    });

    return res.status(200).json(queue);
  } catch (error) {
    next(error);
  }
};

// GET /api/hospital/donation-records/accepted
exports.listAcceptedDonors = async (req, res, next) => {
  try {
    const hospitalRequests = await BloodRequest.find({
      hospital: req.user.id,
    }).select('_id');

    const hospitalRequestIds = hospitalRequests.map((r) => r._id);

    // Find accepted responses on hospital requests
    const acceptedResponses = await BloodRequestResponse.find({
      bloodRequest: { $in: hospitalRequestIds },
      status: 'accepted',
      donationOutcome: { $ne: 'did_not_donate' },
    })
      .populate('donor', 'name phone bloodType shortId isDeleted')
      .populate('bloodRequest', 'bloodType status requestType quantityNeeded isEmergency');

    const orphanedResponseIds = acceptedResponses
      .filter((r) => !r.donor || r.donor.isDeleted || !r.bloodRequest)
      .map((r) => r._id);

    if (orphanedResponseIds.length > 0) {
      await BloodRequestResponse.deleteMany({ _id: { $in: orphanedResponseIds } }).catch(() => {});
    }

    const validResponses = acceptedResponses.filter(
      (r) => r.donor != null && !r.donor.isDeleted && r.bloodRequest != null
    );

    // Exclude responses that already have a donation record
    const existingRecords = await DonationRecord.find({
      bloodRequestResponse: { $in: validResponses.map((r) => r._id) },
    }).select('bloodRequestResponse');

    const recordedResponseIds = new Set(
      existingRecords.map((rec) => rec.bloodRequestResponse.toString())
    );

    const pendingRecordResponses = validResponses.filter(
      (r) => !recordedResponseIds.has(r._id.toString())
    );

    return res.status(200).json({
      success: true,
      data: pendingRecordResponses,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/hospital/donation-records
exports.listHospitalRecords = async (req, res, next) => {
  try {
    const records = await DonationRecord.find({
      hospital: req.user.id,
      outcome: { $ne: 'did_not_donate' },
    })
      .sort({ donationDate: -1, createdAt: -1 })
      .populate('donor', 'name shortId bloodType phone isDeleted')
      .populate('bloodRequest', 'bloodType status requestType');

    // ONLY return records for active, existing donors. Never return cards for deleted donors.
    const activeRecords = records.filter((r) => r.donor != null && !r.donor.isDeleted);

    const formattedRecords = activeRecords.map((r) => {
      return {
        id: r._id.toString(),
        requestId: r.bloodRequest?._id?.toString() || null,
        responseId: r.bloodRequestResponse?.toString() || null,
        donorName: r.donor.name,
        donorId: r.donor.shortId || r.donor._id?.toString() || '',
        donorPhone: r.donor.phone || '',
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
      };
    });

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
      recordedBy,
      healthStatus,
      heightCm,
      weightKg,
      peopleSaved
    } = req.body;

    let bloodRequestId = bloodRequestIdParam(rawReqId, requestId);
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

    let response = null;
    let responseDonor = null;
    if (bloodRequestResponseId) {
      response = await BloodRequestResponse.findById(bloodRequestResponseId);
      if (!response) {
        return res.status(404).json({ success: false, error: 'Blood request response not found.' });
      }
      if (!bloodRequestId) {
        bloodRequestId = response.bloodRequest;
      } else if (response.bloodRequest.toString() !== bloodRequestId.toString()) {
        return res.status(400).json({ success: false, error: 'Response does not match the blood request.' });
      }
      if (response.status !== 'accepted') {
        return res.status(400).json({ success: false, error: 'Donor did not accept this request.' });
      }

      responseDonor = await Donor.findOne({ _id: response.donor, isDeleted: { $ne: true } });
      if (!responseDonor) {
        // Cleanup stale response
        await BloodRequestResponse.findByIdAndDelete(response._id).catch(() => {});
        return res.status(404).json({ success: false, error: 'Donor no longer exists or account has been deleted.' });
      }

      // Prevent repeated or conflicting outcomes
      if (response.donationOutcome === 'donated') {
        return res.status(409).json({
          success: false,
          error: 'Record already exists for this donor response.',
        });
      }

      if (response.donationOutcome === 'did_not_donate') {
        if (outcome === 'did_not_donate') {
          return res.status(200).json({
            success: true,
            message: 'Donor already marked as did not donate.',
            outcome: 'did_not_donate',
          });
        }
        return res.status(400).json({
          success: false,
          error: 'Cannot record donation for donor already marked as did not donate.',
        });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Blood request response ID is required.' });
    }

    if (!bloodRequestId) {
      return res.status(400).json({ success: false, error: 'Blood request ID is required.' });
    }

    const request = await BloodRequest.findById(bloodRequestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Blood request not found.' });
    }
    const userHospitalId = (req.user?.id || req.user?._id || '').toString();
    if (request.hospital.toString() !== userHospitalId) {
      return res.status(403).json({ success: false, error: 'Unauthorized blood request access.' });
    }

    // --- CASE 1: HOSPITAL SELECTS "DID NOT DONATE" ---
    if (outcome === 'did_not_donate') {
      // Mark response so it is excluded from future pending queries
      if (response) {
        response.donationOutcome = 'did_not_donate';
        await response.save();
      }

      // Dispatch kind, encouraging notification and SMS to donor (hoping they can donate another time)
      const donor = responseDonor || (response?.donor ? await Donor.findOne({ _id: response.donor, isDeleted: { $ne: true } }) : null);
      const hospital = await Hospital.findById(req.user.id);
      const hospitalName = hospital?.hospitalName || hospital?.name || 'the hospital';

      if (donor) {
        if (donor.pushToken) {
          sendDidNotDonateEncouragement(donor.pushToken, {
            hospitalName,
          }).catch((err) => console.error('[FCM] Did-not-donate push error:', err));
        }

        if (donor.phone) {
          sendDidNotDonateEncouragementSms(donor.phone, {
            hospitalName,
          }).catch((err) => console.error('[SMS] Did-not-donate SMS error:', err));
        }
      }

      // Explicitly: NO DonationRecord created in DB, NO update to donor lastDonatedAt/cooldown
      return res.status(200).json({
        success: true,
        message: 'Donor marked as did not donate. Encouraging message sent.',
        outcome: 'did_not_donate',
      });
    }

    // --- CASE 2: SUCCESSFUL DONATION ("DONATED") ---
    // Check duplicate record (409 Conflict)
    if (bloodRequestResponseId) {
      const exists = await DonationRecord.findOne({ bloodRequestResponse: bloodRequestResponseId });
      if (exists) {
        return res
          .status(409)
          .json({ success: false, error: 'Record already exists for this donor response.' });
      }
    }

    const resolvedBloodType = rawDonorBloodType || bloodType || (request ? request.bloodType : null);
    if (!resolvedBloodType || !VALID_BLOOD_TYPES.includes(resolvedBloodType)) {
      return res
        .status(400)
        .json({ success: false, error: 'Valid donorBloodType is required for donations.' });
    }

    const recordPayload = {
      bloodRequest: request ? request._id : undefined,
      bloodRequestResponse: response ? response._id : undefined,
      donor: response ? response.donor : (donorId || undefined),
      hospital: req.user.id,
      outcome: 'donated',
      donationDate: new Date(donationDate),
      requestBloodType: request ? request.bloodType : resolvedBloodType, // Injected from DB, not client
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

    recordPayload.donorBloodType = resolvedBloodType;
    recordPayload.unitsCollected = unitsCollected ? Number(unitsCollected) : 1;
    recordPayload.pulse = rawPulse ?? vitals?.pulse ?? null;
    recordPayload.hemoglobin = rawHgb ?? vitals?.hemoglobin ?? null;
    recordPayload.systolic = rawSys ?? vitals?.systolic ?? null;
    recordPayload.diastolic = rawDia ?? vitals?.diastolic ?? null;
    recordPayload.temperature = rawTemp ?? vitals?.temperature ?? null;
    recordPayload.healthIssues = healthIssues || notes || null;
    recordPayload.thankYouMessage = thankYouMessage || null;

    if (healthStatus || heightCm || weightKg || peopleSaved) {
      const extraNotes = [
        healthStatus ? `Health: ${healthStatus}` : null,
        heightCm ? `Height: ${heightCm}cm` : null,
        weightKg ? `Weight: ${weightKg}kg` : null,
        peopleSaved ? `People saved: ${peopleSaved}` : null,
      ].filter(Boolean).join('; ');
      recordPayload.notes = recordPayload.notes ? `${recordPayload.notes} | ${extraNotes}` : extraNotes;
    }

    const record = await DonationRecord.create(recordPayload);

    // Update response status to reflect recorded donation
    if (response) {
      response.donationOutcome = 'donated';
      await response.save();
    }

    // Update lastDonatedAt and dispatch thank-you notification with 90-day cooldown date
    const dDate = new Date(donationDate);
    const nextEligibleDate = new Date(dDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    const targetDonorId = response ? response.donor : (donorId || undefined);
    if (targetDonorId) {
      const updatedDonor = await Donor.findByIdAndUpdate(
        targetDonorId,
        { lastDonatedAt: dDate },
        { new: true }
      );

      if (updatedDonor) {
        sendDonationThankYou(updatedDonor.pushToken, {
          donationDate: dDate,
          nextEligibilityDate: nextEligibleDate,
          donorId: updatedDonor._id,
        }).catch((err) => console.error('[FCM] Thank-you dispatch error:', err));

        sendDonationThankYouSms(updatedDonor.phone, {
          donationDate: dDate,
          nextEligibilityDate: nextEligibleDate,
        }).catch((err) => console.error('[SMS] Thank-you dispatch error:', err));
      }
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
    const records = await DonationRecord.find({ donor: req.user.id, outcome: 'donated' })
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
