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
 *   post:
 *     summary: Verify hospital email via OTP
 *     tags: [Hospitals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string }
 *               code: { type: string }
 */
router.post('/verify-email', hospitalAuthController.verifyEmail);
router.get('/verify-email', hospitalAuthController.verifyEmail);

/**
 * @swagger
 * /hospital/resend-email-code:
 *   post:
 *     summary: Resend hospital email verification OTP
 *     tags: [Hospitals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 */
router.post('/resend-email-code', hospitalAuthController.resendEmailCode);

module.exports = router;