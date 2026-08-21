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
 * /superadmin/feedbacks:
 *   get:
 *     summary: List feedbacks submitted by rejected hospitals
 *     tags: [SuperAdmin, Feedbacks]
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
 * /superadmin/feedbacks/{id}/review:
 *   patch:
 *     summary: Mark a feedback as reviewed
 *     tags: [SuperAdmin, Feedbacks]
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
 */
router.patch('/feedbacks/:id/review', verifyToken, requireRole('superadmin'), superAdminController.markFeedbackReviewed);

/**
 * @swagger
 * /superadmin/events:
 *   post:
 *     summary: Post a new event
 *     tags: [SuperAdmin, Events]
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
 *               description: { type: string }
 *               closesAt: { type: string, format: date-time }
 *               mediaUrl: { type: string }
 *               mediaType: { type: string, enum: [image, video] }
 *               applyLink: { type: string }
 *     responses:
 *       201:
 *         description: Event created successfully
 *       400:
 *         description: Validation error
 */
router.post('/events', verifyToken, requireRole('superadmin'), superAdminController.createEvent);

/**
 * @swagger
 * /superadmin/events:
 *   get:
 *     summary: List events for Super Admin
 *     tags: [SuperAdmin, Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of events
 */
router.get('/events', verifyToken, requireRole('superadmin'), superAdminController.listAdminEvents);

module.exports = router;
