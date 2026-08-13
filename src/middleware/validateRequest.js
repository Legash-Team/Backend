// Used by all three controllers after their
// express-validator rule chains (see src/utils/validators/*.js).
//
// Usage in a route file:
//   router.post('/register', donorValidators.register, validateRequest, controller.registerDonor);

const { validationResult } = require('express-validator');

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Take the first validation error's message - keeps the response simple and matches
    // the standard { success, error } shape from API_CONTRACT.md.
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg,
    });
  }
  next();
}

module.exports = validateRequest;