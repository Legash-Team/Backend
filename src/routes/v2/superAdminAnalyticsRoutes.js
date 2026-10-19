const express = require('express');
const verifyToken = require('../../middleware/authMiddleware');
const requireRole = require('../../middleware/requireRole');
const {
  getHospitalStock,
  getHospitalAnalytics
} = require('../../controllers/hospitalAnalyticsController');

const router = express.Router();

router.get('/hospitals/stock', verifyToken, requireRole('superadmin'), getHospitalStock);
router.get('/analytics/hospitals', verifyToken, requireRole('superadmin'), getHospitalAnalytics);

module.exports = { mounts: [{ path: '/api/superadmin', router }] };
