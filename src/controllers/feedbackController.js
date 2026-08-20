const Feedback = require('../models/Feedback');
const Hospital = require('../models/Hospital');

exports.submitFeedback = async (req, res, next) => {
  try {
    const { email, hospitalName, subject, message } = req.body;

    if (!email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Email and feedback message are required.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    let finalHospitalName = hospitalName;

    // Retrieve original hospital name if not provided
    if (!finalHospitalName) {
      const hospital = await Hospital.findOne({ email: cleanEmail });
      finalHospitalName = hospital ? (hospital.hospitalName || hospital.name) : 'Hospital';
    }

    const feedback = await Feedback.create({
      hospitalEmail: cleanEmail,
      hospitalName: finalHospitalName,
      subject: subject || 'Registration Appeal Feedback',
      message: message.trim()
    });

    return res.status(201).json({
      success: true,
      message: 'Your feedback has been received. Super Admin will review your appeal.',
      data: feedback
    });
  } catch (error) {
    next(error);
  }
};