const Event = require('../models/Event');

exports.listEvents = async (req, res, next) => {
  try {
    const events = await Event.find().sort({ eventDate: 1 });
    res.status(200).json({
      success: true,
      events: events.map(e => ({
        id: e._id,
        title: e.title,
        description: e.description,
        eventDate: e.eventDate,
        location: e.location,
      })),
    });
  } catch (error) {
    next(error);
  }
};
