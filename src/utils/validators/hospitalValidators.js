const { body } = require('express-validator');

const PHONE_PATTERN = /^\+251\d{9}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

exports.register = [
  body().custom((value, { req }) => {
    // Accepts either 'hospitalName' or 'name'
    const name = req.body.hospitalName || req.body.name;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new Error('Hospital name is required.');
    }
    return true;
  }),
  body('password')
    .matches(PASSWORD_PATTERN)
    .withMessage('Password must be at least 8 characters with one uppercase letter and one special character.'),
  body('licenseNumber').notEmpty().withMessage('License number is required.'),
  body('phone')
    .matches(PHONE_PATTERN)
    .withMessage('Phone must be in +251 format.'),
  body('email').isEmail().withMessage('Must be a valid email.'),
  body('location')
    .custom((value) => {
      if (!value || typeof value !== 'object') return false;
      // Accepts either { lat, lng } OR { coordinates: [lng, lat] }
      const hasLatLng = typeof value.lat === 'number' && typeof value.lng === 'number';
      const hasCoordinates = Array.isArray(value.coordinates) && value.coordinates.length === 2;
      return hasLatLng || hasCoordinates;
    })
    .withMessage('Location must include valid coordinates or lat/lng.'),
  body('agreedToTerms')
    .optional()
    .custom((value) => value === true)
    .withMessage('You must agree to the Terms and Policy.'),
];