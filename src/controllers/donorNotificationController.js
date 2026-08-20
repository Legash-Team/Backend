// Backend/src/controllers/donorNotificationController.js
const BloodRequestResponse = require('../models/BloodRequestResponse');
const Donor = require('../models/Donor');

exports.list = async (req, res, next) => {
  try {
    const filter = { donor: req.user.id };

    if (req.query.status) {
      // Ongoing maps to pending internally
      if (req.query.status === 'ongoing' || req.query.status === 'pending') {
        filter.status = 'pending';
      } else if (req.query.status === 'accepted' || req.query.status === 'denied') {
        filter.status = req.query.status;
      }
    }

    const responses = await BloodRequestResponse.find(filter)
      .sort({ notifiedAt: -1, createdAt: -1 })
      .populate({
        path: 'bloodRequest',
        populate: {
          path: 'hospital',
          select: 'hospitalName phone location',
        },
      });

    const notifications = responses.map((r) => {
      const parentReq = r.bloodRequest;
      return {
        id: r._id,
        hospitalName: parentReq?.hospital?.hospitalName || 'Unknown Hospital',
        bloodType: parentReq?.bloodType || 'Unknown',
        quantityNeeded: parentReq?.quantityNeeded || 0,
        isEmergency: parentReq?.isEmergency || false,
        description: parentReq?.description || '',
        myResponseStatus: r.status,
        requestStatus: parentReq?.status || 'closed',
        notifiedAt: r.notifiedAt,
        closesAt: parentReq?.closesAt || null,
      };
    });

    return res.status(200).json({ success: true, notifications });
  } catch (error) {
    next(error);
  }
};

exports.respond = async (req, res, next) => {
  try {
    const { response } = req.body;
    if (response !== 'accepted' && response !== 'denied') {
      return res.status(400).json({ success: false, error: 'Response must be accepted or denied.' });
    }

    const responseDoc = await BloodRequestResponse.findById(req.params.id).populate({
      path: 'bloodRequest',
      populate: {
        path: 'hospital',
        select: 'hospitalName phone location',
      },
    });

    if (!responseDoc || responseDoc.donor.toString() !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Notification not found.' });
    }

    if (!responseDoc.bloodRequest || responseDoc.bloodRequest.status === 'closed') {
      return res.status(400).json({ success: false, error: 'This request has already closed.' });
    }

    if (responseDoc.status === 'accepted' || responseDoc.status === 'denied') {
      return res.status(400).json({ success: false, error: "You've already responded to this request." });
    }

    responseDoc.status = response;
    responseDoc.respondedAt = new Date();
    await responseDoc.save();

    const hospital = responseDoc.bloodRequest.hospital;
    const lat = hospital?.location?.coordinates?.[1] ?? null;
    const lng = hospital?.location?.coordinates?.[0] ?? null;

    return res.status(200).json({
      success: true,
      message: 'Your response has been recorded.',
      nextSteps:
        response === 'accepted'
          ? {
              hospitalName: hospital?.hospitalName || 'Hospital',
              hospitalPhone: hospital?.phone || '',
              hospitalLocation: { lat, lng },
            }
          : undefined,
    });
  } catch (error) {
    next(error);
  }
};

exports.registerPushToken = async (req, res, next) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken) {
      return res.status(400).json({ success: false, error: 'pushToken is required.' });
    }

    await Donor.findByIdAndUpdate(req.user.id, { pushToken });

    return res.status(200).json({ success: true, message: 'Push notifications enabled.' });
  } catch (error) {
    next(error);
  }
};