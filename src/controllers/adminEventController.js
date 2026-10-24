// Backend/src/controllers/adminEventController.js
const Event = require('../models/Event');

/**
 * List events created by the currently authenticated Admin.
 * Scoped strictly to { createdBy: req.user.id, creatorModel: 'Admin' }.
 */
exports.listMyEvents = async (req, res, next) => {
  try {
    const creatorModel = req.user.role === 'superadmin' ? 'SuperAdmin' : 'Admin';
    const events = await Event.find({
      createdBy: req.user.id,
      creatorModel,
    }).sort({ createdAt: -1 });

    const formattedEvents = events.map((e) => ({
      id: e._id,
      title: e.title || 'Legash Blood Donation Event',
      description: e.description,
      mediaUrl: e.mediaUrl,
      mediaType: e.mediaType,
      applyLink: e.applyLink,
      closesAt: e.closesAt,
      status: e.status,
      createdAt: e.createdAt,
    }));

    return res.status(200).json({
      success: true,
      events: formattedEvents,
    });
  } catch (error) {
    next(error);
  }
};
