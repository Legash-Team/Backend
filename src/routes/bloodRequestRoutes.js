const express = require('express');
const router = express.Router();
const bloodRequestController = require('../controllers/bloodRequestController');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

router.post('/', verifyToken, requireRole('hospital'), bloodRequestController.create);
router.get('/', verifyToken, requireRole('hospital'), bloodRequestController.list);
router.get('/:id/responses', verifyToken, requireRole('hospital'), bloodRequestController.getResponses);
router.patch('/:id/close', verifyToken, requireRole('hospital'), bloodRequestController.close);

module.exports = router;
