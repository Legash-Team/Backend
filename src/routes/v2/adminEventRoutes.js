// Backend/src/routes/v2/adminEventRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/authMiddleware');
const requireRole = require('../../middleware/requireRole');
const adminEventController = require('../../controllers/adminEventController');

const router = express.Router();

router.get('/mine', verifyToken, requireRole(['admin', 'superadmin']), adminEventController.listMyEvents);
router.patch('/:id/close', verifyToken, requireRole(['admin', 'superadmin']), adminEventController.closeEvent);

module.exports = {
  mounts: [
    { path: '/api/admin/events', router },
  ],
};
