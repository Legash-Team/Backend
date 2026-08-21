const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const superAdminController = require('../controllers/superAdminController');

/**
 * @swagger
 * /superadmin/hospitals/pending:
 *   get:
 *     summary: List hospitals pending approval
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending, email-verified hospitals awaiting approval
 *       401:
 *         description: No or invalid token
 *       403:
 *         description: Valid token but not a Super Admin
 */
router.get('/hospitals/pending', verifyToken, requireRole('superadmin'), superAdminController.listPendingHospitals);

/**
 * @swagger
 * /superadmin/hospitals/{id}/approve:
 *   post:
 *     summary: Approve a pending hospital
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Hospital approved and notified
 *       400:
 *         description: Hospital is not currently pending approval
 *       401:
 *         description: No or invalid token
 *       403:
 *         description: Valid token but not a Super Admin
 */
router.post('/hospitals/:id/approve', verifyToken, requireRole('superadmin'), superAdminController.approveHospital);

/**
 * @swagger
 * /superadmin/hospitals/{id}/reject:
 *   post:
 *     summary: Reject a pending hospital
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Hospital rejected and notified
 *       400:
 *         description: Hospital is not currently pending approval
 *       401:
 *         description: No or invalid token
 *       403:
 *         description: Valid token but not a Super Admin
 */
router.post('/hospitals/:id/reject', verifyToken, requireRole('superadmin'), superAdminController.rejectHospital);

/**
 * @swagger
 * /superadmin/admins:
 *   post:
 *     summary: Create an Admin account and send verification OTP
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Admin User
 *               email:
 *                 type: string
 *                 example: admin@example.com
 *               permissions:
 *                 type: object
 *                 properties:
 *                   canApproveHospitals:
 *                     type: boolean
 *                     default: false
 *                   canPostEvents:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       201:
 *         description: Admin created successfully and OTP sent
 *       400:
 *         description: Validation error or admin already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Super Admin only)
 */
router.post('/admins', verifyToken, requireRole('superadmin'), superAdminController.createAdmin);

/**
 * @swagger
 * /superadmin/admins:
 *   get:
 *     summary: List all Admin accounts
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of Admins
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Super Admin only)
 */
router.get('/admins', verifyToken, requireRole('superadmin'), superAdminController.listAdmins);

/**
 * @swagger
 * /superadmin/admins/verify-otp:
 *   post:
 *     summary: Verify Admin OTP
 *     tags: [SuperAdmin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@example.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/admins/verify-otp', superAdminController.verifyAdminOtp);
router.post('/verify-admin-otp', superAdminController.verifyAdminOtp);

module.exports = router;
