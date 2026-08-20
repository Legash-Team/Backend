const EventPost = require('../models/EventPost');

exports.listPublicEvents = async (req, res, next) => {
  try {
    const events = await EventPost.find().sort({ closesAt: -1 });

    const formattedEvents = events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      mediaUrl: event.mediaUrl,
      mediaType: event.mediaType,
      applicationLink: event.applicationLink,
      closesAt: event.closesAt,
      isOpen: new Date(event.closesAt) > new Date(),
      createdAt: event.createdAt
    }));

    return res.status(200).json({
      success: true,
      data: formattedEvents
    });
  } catch (error) {
    next(error);
  }
};
