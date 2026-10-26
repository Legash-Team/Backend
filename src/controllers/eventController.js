const Event = require('../models/Event');

exports.listEvents = async (req, res, next) => {
  try {
    const events = await Event.find().sort({ closesAt: 1 });
    res.status(200).json({
      success: true,
      events: events.map(e => ({
        id: e._id,
        title: e.title || 'Legash Blood Donation Event',
        description: e.description,
        eventDate: e.closesAt,
        location: e.location || 'Blood Center',
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.listPublicEvents = async (req, res, next) => {
  try {
    const now = new Date();
    const { status } = req.query;

    let query = {};
    if (status === 'closed') {
      query = {
        $or: [{ status: 'closed' }, { closesAt: { $lte: now } }],
      };
    } else if (status === 'all') {
      query = {};
    } else {
      // Default or status='active': only open, unexpired events for public donor feed
      query = {
        closesAt: { $gt: now },
        status: { $ne: 'closed' },
      };
    }

    const events = await Event.find(query)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name centerName');

    const formattedEvents = events.map((event) => {
      const isClosed = event.status === 'closed' || (event.closesAt && new Date(event.closesAt) <= now);
      const item = {
        id: event._id,
        title: event.title || 'Legash Blood Donation Event',
        mediaUrl: event.mediaUrl,
        mediaType: event.mediaType,
        description: event.description,
        applyLink: event.applyLink,
        closesAt: event.closesAt,
        createdAt: event.createdAt,
        status: isClosed ? 'closed' : 'open',
      };

      if (event.creatorModel === 'Admin') {
        item.postedBy = event.createdBy?.centerName || event.createdBy?.name || 'Blood Center';
      }

      return item;
    });

    return res.status(200).json({
      success: true,
      events: formattedEvents,
    });
  } catch (error) {
    next(error);
  }
};
