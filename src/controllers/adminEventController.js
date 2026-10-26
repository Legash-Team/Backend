// Backend/src/controllers/adminEventController.js
const Event = require('../models/Event');

/**
 * List events created by the currently authenticated Admin.
 * Scoped strictly to { createdBy: req.user.id, creatorModel: 'Admin' }.
 */
exports.listMyEvents = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const isSuperAdmin = req.user.role === 'superadmin';

    const query = isSuperAdmin
      ? { $or: [{ createdBy: userId }, { creatorModel: 'SuperAdmin' }] }
      : { createdBy: userId, creatorModel: 'Admin' };

    const events = await Event.find(query).sort({ createdAt: -1 });

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

/**
 * Close an event manually (SuperAdmin or the Admin who created it).
 */
exports.closeEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    // SuperAdmin can close any event; Admins can close their own event
    if (req.user.role !== 'superadmin' && event.createdBy?.toString() !== (req.user.id || req.user._id).toString()) {
      return res.status(403).json({ success: false, error: 'You do not have permission to close this event.' });
    }

    event.status = 'closed';
    await event.save();

    return res.status(200).json({
      success: true,
      message: 'Event closed successfully.',
      event: {
        id: event._id,
        title: event.title,
        status: event.status,
        closesAt: event.closesAt
      }
    });
  } catch (error) {
    next(error);
  }
};
