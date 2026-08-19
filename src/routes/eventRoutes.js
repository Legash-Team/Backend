const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const eventController = require('../controllers/eventController');

/**
 * @swagger
 * /donor/events:
 *   get:
 *     summary: List all events
 *     tags: [Donor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of events (empty array if none posted yet)
 *       401:
 *         description: No or invalid token
 *       403:
 *         description: Valid token but not a Donor
 */
router.get('/', verifyToken, requireRole('donor'), eventController.listEvents);

module.exports = router;
