// Backend/src/utils/validators/donorValidators.js
const { body } = require('express-validator');

const PHONE_PATTERN = /^\+251\d{9}$/;
const PIN_PATTERN = /^\d{4}$/;
const CODE_PATTERN = /^\d{6}$/;

exports.register = [
  body('name').notEmpty().withMessage('Name is required.'),
  body('phone').matches(PHONE_PATTERN).withMessage('Phone must be in +251 format.'),
  body('fin').notEmpty().withMessage('Fayda national ID (FIN) is required.'),
  body('gender').optional().isIn(['male', 'female']).withMessage('Gender must be male or female.'),
  body('bloodType')
    .optional()
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'])
    .withMessage('Invalid blood type.'),
  body('location')
    .custom((value) => {
      if (!value || typeof value !== 'object') return false;
      const hasLatLng = typeof value.lat === 'number' && typeof value.lng === 'number';
      const hasCoordinates = Array.isArray(value.coordinates) && value.coordinates.length === 2;
      return hasLatLng || hasCoordinates;
    })
    .withMessage('Location must include valid lat and lng coordinates.'),
  body('agreedToTerms')
    .optional()
    .custom((value) => value === true)
    .withMessage('You must agree to the Terms and Policy.'),
];

exports.verifyOtp = [
  body('phone').matches(PHONE_PATTERN).withMessage('Phone must be in +251 format.'),
  body('code').matches(CODE_PATTERN).withMessage('Code must be 6 digits.'),
];

exports.resendOtp = [
  body('phone').matches(PHONE_PATTERN).withMessage('Phone must be in +251 format.'),
];

exports.setPin = [
  body('phone').matches(PHONE_PATTERN).withMessage('Phone must be in +251 format.'),
  body('pin').matches(PIN_PATTERN).withMessage('PIN must be exactly 4 digits.'),
  body('confirmPin').custom((value, { req }) => {
    if (value !== req.body.pin) throw new Error('PIN confirmation does not match.');
    return true;
  }),
];

exports.unlock = [
  body('pin').matches(PIN_PATTERN).withMessage('PIN must be exactly 4 digits.'),
];

exports.forgotPin = [
  body('phone').matches(PHONE_PATTERN).withMessage('Phone must be in +251 format.'),
];

exports.resetPin = [
  body('phone').matches(PHONE_PATTERN).withMessage('Phone must be in +251 format.'),
  body('code').matches(CODE_PATTERN).withMessage('Code must be 6 digits.'),
  body('pin').matches(PIN_PATTERN).withMessage('PIN must be exactly 4 digits.'),
  body('confirmPin').custom((value, { req }) => {
    if (value !== req.body.pin) throw new Error('PIN confirmation does not match.');
    return true;
  }),
];