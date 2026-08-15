const { body } = require('express-validator');

const PHONE_PATTERN = /^\+251\d{9}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;

exports.register = [
  body('hospitalName').notEmpty().withMessage('Hospital name is required.'),
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
      return typeof value.lat === 'number' && typeof value.lng === 'number';
    })
    .withMessage('Location must include valid lat and lng.'),
  body('agreedToTerms')
    .custom((value) => value === true)
    .withMessage('You must agree to the Terms and Policy.'),
];