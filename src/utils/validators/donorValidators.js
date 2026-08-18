const { body } = require('express-validator');

const PHONE_PATTERN = /^\+251\d{9}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
const CODE_PATTERN = /^\d{6}$/;

exports.register = [
  body('name').notEmpty().withMessage('Name is required.'),
  body('password')
    .matches(PASSWORD_PATTERN)
    .withMessage('Password must be at least 8 characters with one uppercase letter and one special character.'),
  body('phone')
    .matches(PHONE_PATTERN)
    .withMessage('Phone must be in +251 format.'),
  body('fin').notEmpty().withMessage('Fayda national ID is required.'),
  body('gender').isIn(['male', 'female']).withMessage('Gender must be male or female.'),
  body('bloodType')
    .optional()
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'])
    .withMessage('Invalid blood type.'),
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

exports.verifyOtp = [
  body('phone')
    .matches(PHONE_PATTERN)
    .withMessage('Phone must be in +251 format.'),
  body('code')
    .matches(CODE_PATTERN)
    .withMessage('Code must be 6 digits.'),
];

exports.login = [
  body('phone')
    .matches(PHONE_PATTERN)
    .withMessage('Phone must be in +251 format.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

exports.forgotPassword = [
  body('phone')
    .matches(PHONE_PATTERN)
    .withMessage('Phone must be in +251 format.'),
];

exports.resetPassword = [
  body('phone')
    .matches(PHONE_PATTERN)
    .withMessage('Phone must be in +251 format.'),
  body('code')
    .matches(CODE_PATTERN)
    .withMessage('Code must be 6 digits.'),
  body('newPassword')
    .matches(PASSWORD_PATTERN)
    .withMessage('Password must be at least 8 characters with one uppercase letter and one special character.'),
];
