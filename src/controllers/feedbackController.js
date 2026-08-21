// Backend/src/controllers/feedbackController.js
const Feedback = require('../models/Feedback');
const Hospital = require('../models/Hospital');

exports.submitFeedback = async (req, res, next) => {
  try {
    const { email, hospitalEmail, hospitalName, message } = req.body;
    const cleanEmail = (email || hospitalEmail || '').toLowerCase().trim();

    if (!cleanEmail || !message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Email and message are required.',
      });
    }

    const hospital = await Hospital.findOne({ email: cleanEmail });

    const feedback = await Feedback.create({
      hospital: hospital ? hospital._id : null,
      email: cleanEmail,
      hospitalName: hospitalName || (hospital ? hospital.hospitalName : 'Hospital'),
      message: message.trim(),
      rejectionReason: hospital ? hospital.rejectionReason : null,
      status: 'new',
    });

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully. Super Admin will review your appeal.',
      feedback,
      data: feedback,
    });
  } catch (error) {
    next(error);
  }
};