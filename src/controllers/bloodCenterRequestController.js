// Backend/src/controllers/bloodCenterRequestController.js
const mongoose = require('mongoose');
const BloodCenterRequest = require('../models/BloodCenterRequest');
const BloodCenterRequestResponse = require('../models/BloodCenterRequestResponse');
const Hospital = require('../models/Hospital');
const Admin = require('../models/Admin');
const { DEFAULT_SEARCH_RADIUS_KM } = require('../utils/constants');
const { VALID_BLOOD_TYPES } = require('../utils/bloodCompatibility');
const { generateMapsUrl } = require('../utils/mapsUrl');

/**
 * 7.1 Hospital: Create a Blood Center Request
 * Finds eligible Blood Centers within DEFAULT_SEARCH_RADIUS_KM,
 * creates the request, and initializes pending response records.
 */
exports.createRequest = async (req, res, next) => {
  try {
    const { bloodType, quantityNeeded, note = '', closesAt } = req.body;

    // 1. Validate Blood Type
    if (!bloodType || !VALID_BLOOD_TYPES.includes(bloodType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid blood type.'
      });
    }

    // 2. Validate Quantity
    if (!Number.isInteger(quantityNeeded) || quantityNeeded < 1) {
      return res.status(400).json({
        success: false,
        error: 'quantityNeeded must be a positive integer.'
      });
    }

    // 3. Validate closesAt (future timestamp)
    if (!closesAt) {
      return res.status(400).json({
        success: false,
        error: 'closesAt must be a valid future timestamp.'
      });
    }

    const closingDate = new Date(closesAt);
    if (Number.isNaN(closingDate.getTime()) || closingDate <= new Date()) {
      return res.status(400).json({
        success: false,
        error: 'closesAt must be a valid future timestamp.'
      });
    }

    // 4. Validate optional note
    if (note !== undefined && note !== null && typeof note !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Note must be a string.'
      });
    }
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    if (cleanNote.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Note cannot exceed 500 characters.'
      });
    }

    // 5. Load requesting hospital and verify location
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital || hospital.isDeleted) {
      return res.status(404).json({
        success: false,
        error: 'Hospital not found.'
      });
    }

    if (
      !hospital.location ||
      !Array.isArray(hospital.location.coordinates) ||
      hospital.location.coordinates.length !== 2 ||
      !hospital.location.coordinates.every(Number.isFinite)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Hospital location is invalid or missing.'
      });
    }

    // 6. Match eligible Blood Centers within DEFAULT_SEARCH_RADIUS_KM
    const maxDistanceMeters = DEFAULT_SEARCH_RADIUS_KM * 1000;
    const matchedCenters = await Admin.find({
      passwordHash: { $ne: null },
      emailVerified: true,
      isDeleted: { $ne: true },
      'location.coordinates': { $exists: true, $ne: [] },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: hospital.location.coordinates
          },
          $maxDistance: maxDistanceMeters
        }
      }
    });

    // 7. Persist request
    const request = await BloodCenterRequest.create({
      hospital: hospital._id,
      bloodType,
      quantityNeeded,
      note: cleanNote,
      closesAt: closingDate,
      status: 'open'
    });

    // 8. Create pending response records for each matched center
    if (matchedCenters.length > 0) {
      try {
        const responseDocs = matchedCenters.map((center) => ({
          request: request._id,
          bloodCenter: center._id,
          status: 'pending'
        }));
        await BloodCenterRequestResponse.insertMany(responseDocs, { ordered: false });
      } catch (err) {
        // Safe failure strategy: remove request doc to avoid inconsistent state
        await BloodCenterRequest.findByIdAndDelete(request._id);
        throw err;
      }
    }

    return res.status(201).json({
      success: true,
      message:
        matchedCenters.length > 0
          ? 'Blood center request created successfully.'
          : 'Blood center request created. No nearby blood centers found within search radius.',
      request: {
        id: request._id,
        bloodType: request.bloodType,
        quantityNeeded: request.quantityNeeded,
        note: request.note,
        status: request.status,
        closesAt: request.closesAt,
        createdAt: request.createdAt
      },
      matchedCenterCount: matchedCenters.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7.2 Hospital: List the requesting Hospital's requests
 */
exports.listHospitalRequests = async (req, res, next) => {
  try {
    const hospitalId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Check expiration at read time for hospital's open requests
    const now = new Date();
    await BloodCenterRequest.updateMany(
      {
        hospital: hospitalId,
        status: 'open',
        closesAt: { $lte: now }
      },
      {
        $set: {
          status: 'closed',
          closedReason: 'expired',
          closedAt: now
        }
      }
    );

    const filter = { hospital: hospitalId };
    if (status === 'open' || status === 'closed') {
      filter.status = status;
    }

    const totalCount = await BloodCenterRequest.countDocuments(filter);
    const requests = await BloodCenterRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const results = await Promise.all(
      requests.map(async (reqDoc) => {
        const responses = await BloodCenterRequestResponse.find({ request: reqDoc._id });
        let acceptedCount = 0;
        let deniedCount = 0;
        let pendingCount = 0;

        for (const resp of responses) {
          if (resp.status === 'accepted') acceptedCount++;
          else if (resp.status === 'denied') deniedCount++;
          else pendingCount++;
        }

        return {
          id: reqDoc._id,
          bloodType: reqDoc.bloodType,
          quantityNeeded: reqDoc.quantityNeeded,
          note: reqDoc.note,
          status: reqDoc.status,
          closedReason: reqDoc.closedReason,
          closesAt: reqDoc.closesAt,
          closedAt: reqDoc.closedAt,
          createdAt: reqDoc.createdAt,
          matchedCenterCount: responses.length,
          acceptedCount,
          deniedCount,
          pendingCount
        };
      })
    );

    return res.status(200).json({
      success: true,
      totalCount,
      page: pageNum,
      limit: limitNum,
      requests: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7.3 Hospital: Get Accepted Centers contact details
 */
exports.getAcceptedCenters = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID.'
      });
    }

    const request = await BloodCenterRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found.'
      });
    }

    // Verify ownership
    if (request.hospital.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this request.'
      });
    }

    // Query only accepted responses
    const acceptedResponses = await BloodCenterRequestResponse.find({
      request: request._id,
      status: 'accepted'
    }).populate('bloodCenter', 'name centerName email phone location');

    const acceptedCenters = acceptedResponses
      .filter((r) => r.bloodCenter)
      .map((r) => {
        const center = r.bloodCenter;
        const coordinates =
          Array.isArray(center.location?.coordinates) && center.location.coordinates.length === 2
            ? { lng: center.location.coordinates[0], lat: center.location.coordinates[1] }
            : null;
        const mapsUrl = generateMapsUrl(center.location);

        return {
          id: center._id,
          centerName: center.centerName || center.name,
          phone: center.phone,
          email: center.email,
          address: center.location?.address || null,
          location: center.location,
          coordinates,
          mapsUrl,
          respondedAt: r.respondedAt || r.updatedAt
        };
      });

    return res.status(200).json({
      success: true,
      requestId: request._id,
      acceptedCenters
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7.4 Hospital: Close request
 */
exports.closeRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID.'
      });
    }

    const request = await BloodCenterRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found.'
      });
    }

    if (request.hospital.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to close this request.'
      });
    }

    if (request.status === 'closed') {
      return res.status(200).json({
        success: true,
        message: 'Request is already closed.',
        request: {
          id: request._id,
          status: request.status,
          closedReason: request.closedReason,
          closedAt: request.closedAt
        }
      });
    }

    request.status = 'closed';
    request.closedReason = 'manual';
    request.closedAt = new Date();
    await request.save();

    return res.status(200).json({
      success: true,
      message: 'Request closed successfully.',
      request: {
        id: request._id,
        status: request.status,
        closedReason: request.closedReason,
        closedAt: request.closedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 8.1 Blood Center: List incoming requests assigned to the center
 */
exports.listIncomingRequests = async (req, res, next) => {
  try {
    const centerId = req.user.id;

    // Verify center account exists and is not soft-deleted
    const center = await Admin.findById(centerId);
    if (!center || center.isDeleted) {
      return res.status(404).json({
        success: false,
        error: 'Blood Center not found.'
      });
    }

    // Find all responses for this center, populating request and sender hospital
    const responses = await BloodCenterRequestResponse.find({
      bloodCenter: center._id
    }).populate({
      path: 'request',
      populate: {
        path: 'hospital',
        select: 'hospitalName email phone location'
      }
    });

    const now = new Date();
    const incoming = [];

    for (const r of responses) {
      if (!r.request) continue;
      const reqDoc = r.request;

      // Dynamic expiry check at read time
      if (reqDoc.status === 'open' && new Date(reqDoc.closesAt) <= now) {
        reqDoc.status = 'closed';
        reqDoc.closedReason = 'expired';
        reqDoc.closedAt = reqDoc.closesAt;
        await reqDoc.save();
      }

      // Center only lists open and non-expired requests
      if (reqDoc.status === 'open' && new Date(reqDoc.closesAt) > now) {
        const hosp = reqDoc.hospital;
        incoming.push({
          requestId: reqDoc._id,
          bloodType: reqDoc.bloodType,
          quantityNeeded: reqDoc.quantityNeeded,
          note: reqDoc.note || '',
          createdAt: reqDoc.createdAt,
          closesAt: reqDoc.closesAt,
          responseStatus: r.status,
          respondedAt: r.respondedAt,
          hospital: hosp
            ? {
                id: hosp._id,
                hospitalName: hosp.hospitalName,
                email: hosp.email,
                phone: hosp.phone,
                location: hosp.location
              }
            : null
        });
      }
    }

    return res.status(200).json({
      success: true,
      requests: incoming
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 8.2 Blood Center: Respond to a request (accept or deny)
 */
exports.respondToRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body;
    const centerId = req.user.id;

    if (!status || !['accepted', 'denied'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be either accepted or denied.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID.'
      });
    }

    const request = await BloodCenterRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found.'
      });
    }

    // Check expiration at write time
    const now = new Date();
    if (request.status === 'open' && new Date(request.closesAt) <= now) {
      request.status = 'closed';
      request.closedReason = 'expired';
      request.closedAt = request.closesAt;
      await request.save();
    }

    if (request.status === 'closed' || new Date(request.closesAt) <= now) {
      return res.status(409).json({
        success: false,
        error: 'This request is closed or has expired.'
      });
    }

    // Atomic conditional update ensuring concurrency safety:
    // Only transitions if current status is 'pending'
    const updatedResponse = await BloodCenterRequestResponse.findOneAndUpdate(
      {
        request: request._id,
        bloodCenter: centerId,
        status: 'pending'
      },
      {
        $set: {
          status,
          respondedAt: now
        }
      },
      { new: true }
    );

    if (!updatedResponse) {
      // Determine precise error reason
      const existing = await BloodCenterRequestResponse.findOne({
        request: request._id,
        bloodCenter: centerId
      });

      if (!existing) {
        return res.status(403).json({
          success: false,
          error: 'You are not authorized to respond to this request.'
        });
      }

      if (existing.status !== 'pending') {
        return res.status(409).json({
          success: false,
          error: 'You have already responded to this request.'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Request successfully ${updatedResponse.status}.`,
      response: {
        id: updatedResponse._id,
        requestId: updatedResponse.request,
        status: updatedResponse.status,
        respondedAt: updatedResponse.respondedAt
      }
    });
  } catch (error) {
    next(error);
  }
};
