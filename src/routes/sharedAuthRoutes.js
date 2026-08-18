const express = require('express');
const router = express.Router();
const sharedAuthController = require('../controllers/sharedAuthController');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login for Hospital and SuperAdmin
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 */
router.post('/login', sharedAuthController.login);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 */
router.post('/forgot-password', sharedAuthController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with emailed code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               code: { type: string }
 *               newPassword: { type: string }
 */
router.post('/reset-password', sharedAuthController.resetPassword);

module.exports = router;