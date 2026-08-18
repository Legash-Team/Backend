const express = require('express');
const router = express.Router();
const hospitalAuthController = require('../controllers/hospitalAuthController');
const hospitalValidators = require('../utils/validators/hospitalValidators');
const validateRequest = require('../middleware/validateRequest');

/**
 * @swagger
 * /hospital/register:
 *   post:
 *     summary: Register a hospital account
 *     tags: [Hospitals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hospitalName: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *               phone: { type: string }
 *               licenseNumber: { type: string }
 *               location:
 *                 type: object
 *                 properties:
 *                   lat: { type: number }
 *                   lng: { type: number }
 *               agreedToTerms: { type: boolean }
 */
router.post('/register', hospitalValidators.register, validateRequest, hospitalAuthController.registerHospital);

/**
 * @swagger
 * /hospital/verify-email:
 *   get:
 *     summary: Verify hospital email via link
 *     tags: [Hospitals]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/verify-email', hospitalAuthController.verifyEmail);

module.exports = router;