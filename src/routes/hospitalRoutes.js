// Backend/src/routes/hospitalRoutes.js
const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');
const bloodRequestController = require('../controllers/bloodRequestController');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

router.use(verifyToken, requireRole('hospital'));

// Dashboard & Profile
router.get('/dashboard', hospitalController.getDashboard);
router.get('/profile', hospitalController.getProfile);
router.put('/profile', hospitalController.updateProfile);
router.post('/profile/change-email/request', hospitalController.requestEmailChange);
router.post('/profile/change-email/confirm', hospitalController.confirmEmailChange);
router.post('/profile/change-password', hospitalController.changePassword);
router.delete('/profile', hospitalController.deleteAccount);

// Fixed 8 Blood-Type Stock Endpoints
router.get('/blood-stock', hospitalController.getBloodStock);
router.put('/blood-stock/:bloodType', hospitalController.updateBloodStock);

// Blood Requests
router.post('/blood-requests', bloodRequestController.create);
router.get('/blood-requests', bloodRequestController.list);
router.get('/blood-requests/:id/responses', bloodRequestController.getResponses);
router.patch('/blood-requests/:id/close', bloodRequestController.close);

module.exports = router;