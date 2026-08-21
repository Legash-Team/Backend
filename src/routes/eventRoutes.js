const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const eventController = require('../controllers/eventController');

router.get('/', verifyToken, requireRole('donor'), eventController.listPublicEvents);

module.exports = router;
