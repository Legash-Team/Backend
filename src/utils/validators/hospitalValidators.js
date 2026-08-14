const Joi = require('joi');

const registerHospitalSchema = Joi.object({
  name: Joi.string().required().min(2),
  licenseNumber: Joi.string().required(),
  phone: Joi.string().pattern(/^\+251\d{9}$/).required()
    .messages({ 'string.pattern.base': 'Phone number must be in +251 format' }),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required()
    .messages({ 'string.min': 'Password must be at least 8 characters long' }),
  location: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2).required(), // [lng, lat]
    address: Joi.string().optional()
  }).required()
});

module.exports = { registerHospitalSchema };