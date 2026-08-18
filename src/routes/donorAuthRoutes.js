const express = require('express');
const router = express.Router();
const donorAuthController = require('../controllers/donorAuthController');
const donorValidators = require('../utils/validators/donorValidators');
const validateRequest = require('../middleware/validateRequest');

/**
 * @swagger
 * /donor/register:
 *   post:
 *     summary: Register a donor account
 *     tags: [Donor]
 */
router.post('/register', donorValidators.register, validateRequest, donorAuthController.registerDonor);

/**
 * @swagger
 * /donor/verify-otp:
 *   post:
 *     summary: Verify donor phone with OTP
 *     tags: [Donor]
 */
router.post('/verify-otp', donorValidators.verifyOtp, validateRequest, donorAuthController.verifyDonorOtp);

/**
 * @swagger
 * /donor/resend-otp:
 *   post:
 *     summary: Resend OTP for phone verification
 *     tags: [Donor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string }
 *     responses:
 *       200:
 *         description: A new OTP has been sent
 */
router.post('/resend-otp', donorValidators.resendOtp, validateRequest, donorAuthController.resendDonorOtp);

/**
 * @swagger
 * /donor/login:
 *   post:
 *     summary: Login a verified donor
 *     tags: [Donor]
 */
router.post('/login', donorValidators.login, validateRequest, donorAuthController.loginDonor);

/**
 * @swagger
 * /donor/forgot-password:
 *   post:
 *     summary: Request an OTP to reset a forgotten password
 *     tags: [Donor]
 */
router.post('/forgot-password', donorValidators.forgotPassword, validateRequest, donorAuthController.forgotDonorPassword);

/**
 * @swagger
 * /donor/reset-password:
 *   post:
 *     summary: Reset a donor password with the OTP code
 *     tags: [Donor]
 */
router.post('/reset-password', donorValidators.resetPassword, validateRequest, donorAuthController.resetDonorPassword);

module.exports = router;