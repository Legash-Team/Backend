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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Incomplete license documentation
 *     responses:
 *       200:
 *         description: Hospital rejected and notified
 *       400:
 *         description: Hospital is not currently pending approval or reason missing
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

/**
 * @swagger
 * /superadmin/feedbacks:
 *   get:
 *     summary: List all hospital appeal feedbacks
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of feedbacks
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Super Admin only)
 */
router.get('/feedbacks', verifyToken, requireRole('superadmin'), superAdminController.listFeedbacks);

/**
 * @swagger
 * /superadmin/feedbacks/{id}/reviewed:
 *   patch:
 *     summary: Mark a feedback as reviewed
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
 *         description: Feedback marked as reviewed
 *       404:
 *         description: Feedback not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Super Admin only)
 */
router.patch('/feedbacks/:id/reviewed', verifyToken, requireRole('superadmin'), superAdminController.markFeedbackReviewed);

/**
 * @swagger
 * /superadmin/events:
 *   post:
 *     summary: Create an event
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description, closesAt]
 *             properties:
 *               mediaUrl: { type: string }
 *               mediaType: { type: string, enum: [image, video] }
 *               description: { type: string }
 *               applyLink: { type: string }
 *               closesAt: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Event created successfully
 *   get:
 *     summary: List all events for admin view
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of events
 */
router.post('/events', verifyToken, requireRole('superadmin'), superAdminController.createEvent);
router.get('/events', verifyToken, requireRole('superadmin'), superAdminController.listAdminEvents);

module.exports = router;