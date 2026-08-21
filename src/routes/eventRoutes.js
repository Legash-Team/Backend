const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const eventController = require('../controllers/eventController');

/**
 * @swagger
 * /donor/events:
 *   get:
 *     summary: List all events for donor dashboard feed
 *     tags: [Donor, Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of events (with open/closed status)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Donor only)
 */
router.get('/', verifyToken, requireRole('donor'), eventController.listEvents);

/**
 * @swagger
 * /donor/events:
 *   post:
 *     summary: Super Admin post event
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
 *               mediaUrl: { type: string }
 *               mediaType: { type: string, enum: [image, video] }
 *               description: { type: string }
 *               applyLink: { type: string }
 *               closesAt: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Event created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/', verifyToken, requireRole('superadmin'), eventController.createEvent);

module.exports = router;
