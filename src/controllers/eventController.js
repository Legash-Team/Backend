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
    // Return only active, unexpired events for donor feed
    const events = await Event.find({
      closesAt: { $gt: now },
    }).sort({ createdAt: -1 });

    const formattedEvents = events.map((event) => ({
      id: event._id,
      mediaUrl: event.mediaUrl,
      mediaType: event.mediaType,
      description: event.description,
      applyLink: event.applyLink,
      closesAt: event.closesAt,
      status: 'open',
    }));

    return res.status(200).json({
      success: true,
      events: formattedEvents,
    });
  } catch (error) {
    next(error);
  }
};
