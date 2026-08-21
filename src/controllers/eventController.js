const Event = require('../models/Event');

/**
 * Super Admin: Post a new event
 */
exports.createEvent = async (req, res, next) => {
  try {
    const { mediaUrl, mediaType, description, applyLink, applyingLink, closesAt, media } = req.body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Description is required.',
      });
    }

    if (!closesAt || isNaN(new Date(closesAt).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'A valid closesAt timestamp is required.',
      });
    }

    // Support both direct fields and media object/string
    let finalMediaUrl = mediaUrl || (typeof media === 'string' ? media : media?.url) || null;
    let finalMediaType = mediaType || media?.type || 'image';
    if (finalMediaType !== 'image' && finalMediaType !== 'video') {
      finalMediaType = 'image';
    }

    const finalApplyLink = (applyLink || applyingLink || '')?.trim() || null;
    const closingDate = new Date(closesAt);

    const event = new Event({
      mediaUrl: finalMediaUrl,
      mediaType: finalMediaType,
      description: description.trim(),
      applyLink: finalApplyLink,
      closesAt: closingDate,
      createdBy: req.user?.id || req.user?._id || null,
      creatorModel: req.user?.role === 'superadmin' ? 'SuperAdmin' : 'Admin',
    });

    await event.save();

    const now = new Date();
    const status = closingDate > now ? 'open' : 'closed';

    return res.status(201).json({
      success: true,
      message: 'Event posted successfully.',
      event: {
        id: event._id,
        mediaUrl: event.mediaUrl,
        mediaType: event.mediaType,
        description: event.description,
        applyLink: event.applyLink,
        closesAt: event.closesAt,
        status,
        createdAt: event.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Donor / Public: List events with computed dynamic status (open/closed)
 * Closed events remain in the list as specified.
 */
exports.listEvents = async (req, res, next) => {
  try {
    const now = new Date();
    const events = await Event.find().sort({ createdAt: -1 });

    const formattedEvents = events.map((event) => {
      const isClosed = new Date(event.closesAt) <= now;
      return {
        id: event._id,
        mediaUrl: event.mediaUrl,
        mediaType: event.mediaType,
        description: event.description,
        applyLink: event.applyLink,
        closesAt: event.closesAt,
        status: isClosed ? 'closed' : 'open',
        createdAt: event.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      events: formattedEvents,
    });
  } catch (error) {
    next(error);
  }
};

// Alias for backwards compatibility
exports.listPublicEvents = exports.listEvents;