const express = require('express');
const router = express.Router();
const donorNotificationController = require('../controllers/donorNotificationController');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

router.get('/', verifyToken, requireRole('donor'), donorNotificationController.list);
router.post('/:id/respond', verifyToken, requireRole('donor'), donorNotificationController.respond);
router.post('/push-token', verifyToken, requireRole('donor'), donorNotificationController.registerPushToken);

module.exports = router;
