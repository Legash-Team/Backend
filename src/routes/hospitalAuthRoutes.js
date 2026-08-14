const express = require('express');
const router = express.Router();
const hospitalAuthController = require('../controllers/hospitalAuthController');
const { validateHospitalRegistration } = require('../utils/validators/sharedValidators');
const { registerHospital, verifyEmail } = require('../controllers/hospitalAuthController');

// POST /api/hospitals/register
router.post('/register', validateHospitalRegistration, hospitalAuthController.registerHospital);

/**
 * @swagger
 * /api/hospitals/verify-email/{token}:
 *   get:
 *     summary: Verify hospital email via link
 *     tags: [Hospitals]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/verify-email/:token', verifyEmail);

module.exports = router;