// Backend/src/routes/v2/bloodCenterRequestRoutes.js
const express = require('express');
const verifyToken = require('../../middleware/authMiddleware');
const requireRole = require('../../middleware/requireRole');
const {
  createRequest,
  listHospitalRequests,
  getAcceptedCenters,
  closeRequest,
  listIncomingRequests,
  respondToRequest
} = require('../../controllers/bloodCenterRequestController');

// 1. Hospital Routes: /api/hospital/blood-center-requests
const hospitalRouter = express.Router();
hospitalRouter.post('/', verifyToken, requireRole('hospital'), createRequest);
hospitalRouter.get('/', verifyToken, requireRole('hospital'), listHospitalRequests);
hospitalRouter.get(
  '/:requestId/accepted-centers',
  verifyToken,
  requireRole('hospital'),
  getAcceptedCenters
);
hospitalRouter.patch('/:requestId/close', verifyToken, requireRole('hospital'), closeRequest);

// 2. Blood Center (Admin) Routes: /api/admin/blood-center-requests
const adminRouter = express.Router();
adminRouter.get('/', verifyToken, requireRole('admin'), listIncomingRequests);
adminRouter.patch('/:requestId/respond', verifyToken, requireRole('admin'), respondToRequest);

module.exports = {
  mounts: [
    { path: '/api/hospital/blood-center-requests', router: hospitalRouter },
    { path: '/api/admin/blood-center-requests', router: adminRouter }
  ]
};
