const express = require('express');
const router = express.Router();
const donorAuthController = require('../controllers/donorAuthController');
const donorValidators = require('../utils/validators/donorValidators');
const validateRequest = require('../middleware/validateRequest');

/**
 * @swagger
 * /api/donor/register:
 *   post:
 *     summary: Register a donor account
 *     tags: [Donor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               password: { type: string }
 *               phone: { type: string }
 *               fin: { type: string }
 *               gender: { type: string, enum: [male, female] }
 *               bloodType: { type: string }
 *               location:
 *                 type: object
 *                 properties:
 *                   lat: { type: number }
 *                   lng: { type: number }
 *               agreedToTerms: { type: boolean }
 *     responses:
 *       201:
 *         description: Registered, OTP sent
 */
router.post('/register', donorValidators.register, validateRequest, donorAuthController.registerDonor);

/**
 * @swagger
 * /api/donor/verify-otp:
 *   post:
 *     summary: Verify donor phone with OTP
 *     tags: [Donor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string }
 *               code: { type: string }
 *     responses:
 *       200:
 *         description: Phone verified
 */
router.post('/verify-otp', donorValidators.verifyOtp, validateRequest, donorAuthController.verifyDonorOtp);

/**
 * @swagger
 * /api/donor/login:
 *   post:
 *     summary: Login a verified donor
 *     tags: [Donor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful, returns JWT
 */
router.post('/login', donorValidators.login, validateRequest, donorAuthController.loginDonor);

module.exports = router;
