// Backend/src/routes/v2/bloodCenterProfileRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/authMiddleware');
const requireRole = require('../../middleware/requireRole');
const bloodCenterProfileController = require('../../controllers/bloodCenterProfileController');

const router = express.Router();

router.get('/profile', verifyToken, requireRole(['admin', 'bloodcenter']), bloodCenterProfileController.getProfile);
router.put('/profile', verifyToken, requireRole(['admin', 'bloodcenter']), bloodCenterProfileController.updateProfile);
router.patch('/profile', verifyToken, requireRole(['admin', 'bloodcenter']), bloodCenterProfileController.updateProfile);
router.post('/profile/change-password', verifyToken, requireRole(['admin', 'bloodcenter']), bloodCenterProfileController.changePassword);

module.exports = {
  mounts: [
    { path: '/api/blood-center', router },
  ],
};
