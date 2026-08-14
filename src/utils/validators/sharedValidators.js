const { registerHospitalSchema } = require('./hospitalValidators');

/**
 * Middleware to validate hospital registration data
 */
exports.validateHospitalRegistration = (req, res, next) => {
  const { error } = registerHospitalSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message
    });
  }

  next();
};