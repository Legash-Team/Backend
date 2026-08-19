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

module.exports = router;
