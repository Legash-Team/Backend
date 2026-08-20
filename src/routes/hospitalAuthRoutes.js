// Backend/src/routes/hospitalAuthRoutes.js
const express = require('express');
const router = express.Router();
const hospitalAuthController = require('../controllers/hospitalAuthController');
const hospitalValidators = require('../utils/validators/hospitalValidators');
const validateRequest = require('../middleware/validateRequest');

router.post('/register', hospitalValidators.register, validateRequest, hospitalAuthController.registerHospital);
router.post('/verify-email', hospitalAuthController.verifyEmail);
router.get('/verify-email', hospitalAuthController.verifyEmail);
router.post('/resend-email-code', hospitalAuthController.resendEmailCode);

module.exports = router;