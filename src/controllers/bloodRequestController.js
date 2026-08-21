// Backend/src/controllers/bloodRequestController.js
const BloodRequest = require('../models/BloodRequest');
const BloodRequestResponse = require('../models/BloodRequestResponse');
const Donor = require('../models/Donor');
const Hospital = require('../models/Hospital');
const { sendBloodAlert } = require('../services/pushService');
const { sendBloodAlertSms } = require('../services/smsService');
const { DEFAULT_SEARCH_RADIUS_KM } = require('../utils/constants');
const { getCompatibleDonorTypes, isBloodTypeKnown } = require('../utils/bloodCompatibility');

exports.create = async (req, res, next) => {
  try {
    const { bloodType, quantityNeeded, isEmergency = false, description = '', closesAt } = req.body;

    if (!isBloodTypeKnown(bloodType)) {
      return res.status(400).json({ success: false, error: 'Invalid blood type.' });
    }
    if (!Number.isInteger(quantityNeeded) || quantityNeeded < 1) {
      return res.status(400).json({ success: false, error: 'quantityNeeded must be a positive integer.' });
    }
    if (!closesAt || new Date(closesAt) <= new Date()) {
      return res.status(400).json({ success: false, error: 'closesAt must be a valid future timestamp.' });
    }

    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found.' });
    }

    const request = await BloodRequest.create({
      hospital: req.user.id,
      bloodType,
      quantityNeeded,
      isEmergency: Boolean(isEmergency),
      description: description.trim(),
      closesAt: new Date(closesAt),
    });

    const compatibleTypes = getCompatibleDonorTypes(bloodType);

    // Match only nearby donors with compatible blood types (excluding unknown)
    const matchedDonors = await Donor.find({
      bloodType: { $in: compatibleTypes },
      isDeleted: { $ne: true },
      location: {
        $near: {
          $geometry: hospital.location,
          $maxDistance: DEFAULT_SEARCH_RADIUS_KM * 1000,
        },
      },
    });

    const notifications = matchedDonors.map(async (donor) => {
      await BloodRequestResponse.create({
        bloodRequest: request._id,
        donor: donor._id,
      });

      const alertData = {
        hospitalName: hospital.hospitalName,
        bloodType,
        quantityNeeded,
      };

      const pushPromise = sendBloodAlert(donor.pushToken, alertData);
      const smsPromise = sendBloodAlertSms(donor.phone, alertData);

      return Promise.allSettled([pushPromise, smsPromise]);
    });

    await Promise.allSettled(notifications);

    return res.status(201).json({
      success: true,
      message: 'Request posted. Nearby compatible donors have been notified.',
      requestId: request._id,
      notifiedDonorCount: matchedDonors.length,
    });
  } catch (error) {
    next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { urgency, status } = req.query;
    const filter = { hospital: req.user.id };

    if (urgency === 'emergency') {
      filter.isEmergency = true;
    } else if (urgency === 'notUrgent') {
      filter.isEmergency = false;
    }

    if (status === 'open' || status === 'closed') {
      filter.status = status;
    }

    const requests = await BloodRequest.find(filter).sort({ createdAt: -1 });

    const results = await Promise.all(
      requests.map(async (reqDoc) => {
        const responses = await BloodRequestResponse.find({ bloodRequest: reqDoc._id });
        let acceptedCount = 0;
        let deniedCount = 0;
        let pendingCount = 0;

        for (const response of responses) {
          if (response.status === 'accepted') acceptedCount++;
          else if (response.status === 'denied') deniedCount++;
          else pendingCount++;
        }

        return {
          id: reqDoc._id,
          bloodType: reqDoc.bloodType,
          quantityNeeded: reqDoc.quantityNeeded,
          isEmergency: reqDoc.isEmergency,
          description: reqDoc.description,
          status: reqDoc.status,
          closedReason: reqDoc.closedReason,
          createdAt: reqDoc.createdAt,
          closesAt: reqDoc.closesAt,
          closedAt: reqDoc.closedAt,
          notifiedDonorCount: responses.length,
          acceptedCount,
          deniedCount,
          pendingCount,
        };
      })
    );

    return res.status(200).json({ success: true, requests: results });
  } catch (error) {
    next(error);
  }
};

exports.getResponses = async (req, res, next) => {
  try {
    const request = await BloodRequest.findById(req.params.id);
    if (!request || request.hospital.toString() !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    const responses = await BloodRequestResponse.find({ bloodRequest: request._id }).populate(
      'donor',
      'name gender bloodType phone'
    );

    const accepted = [];
    let deniedCount = 0;
    let pendingCount = 0;

    for (const response of responses) {
      if (response.status === 'accepted') {
        if (response.donor) {
          accepted.push({
            id: response.donor._id,
            name: response.donor.name,
            gender: response.donor.gender,
            bloodType: response.donor.bloodType,
            phone: response.donor.phone,
          });
        }
      } else if (response.status === 'denied') {
        deniedCount++;
      } else {
        pendingCount++;
      }
    }

    return res.status(200).json({
      success: true,
      requestStatus: request.status,
      accepted,
      deniedCount,
      pendingCount,
    });
  } catch (error) {
    next(error);
  }
};

exports.close = async (req, res, next) => {
  try {
    const request = await BloodRequest.findById(req.params.id);
    if (!request || request.hospital.toString() !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    if (request.status !== 'open') {
      return res.status(400).json({ success: false, error: 'This request is already closed.' });
    }

    request.status = 'closed';
    request.closedReason = 'manual';
    request.closedAt = new Date();
    await request.save();

    return res.status(200).json({ success: true, message: 'Request closed.' });
  } catch (error) {
    next(error);
  }
};