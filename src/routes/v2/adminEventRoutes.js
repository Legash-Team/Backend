// Backend/src/routes/v2/adminEventRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/authMiddleware');
const requireRole = require('../../middleware/requireRole');
const adminEventController = require('../../controllers/adminEventController');

const router = express.Router();

router.get('/mine', verifyToken, requireRole(['admin', 'superadmin']), adminEventController.listMyEvents);

module.exports = {
  mounts: [
    { path: '/api/admin/events', router },
    { path: '/api/superadmin/events', router },
  ],
};
