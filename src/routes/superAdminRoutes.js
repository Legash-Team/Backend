// Backend/src/routes/superAdminRoutes.js
const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');

// Protected Super Admin & Scoped Admin routes
router.use(verifyToken);

// Pending Hospital Approvals & Rejections
router.get(
  '/hospitals/pending',
  requirePermission('canApproveHospitals'),
  superAdminController.listPendingHospitals
);
router.get(
  '/pending-hospitals',
  requirePermission('canApproveHospitals'),
  superAdminController.listPendingHospitals
);
router.post(
  '/hospitals/:id/approve',
  requirePermission('canApproveHospitals'),
  superAdminController.approveHospital
);
router.post(
  '/hospitals/:id/reject',
  requirePermission('canApproveHospitals'),
  superAdminController.rejectHospital
);

// Feedbacks Management (Super Admin only)
router.get('/feedbacks', requireRole('superadmin'), superAdminController.listFeedbacks);
router.patch('/feedbacks/:id/reviewed', requireRole('superadmin'), superAdminController.markFeedbackReviewed);

// Events Management
router.post('/events', requirePermission('canPostEvents'), superAdminController.createEvent);
router.get('/events', requirePermission('canPostEvents'), superAdminController.listAdminEvents);

// Scoped Admin Management (Super Admin only)
router.post('/admins', requireRole('superadmin'), superAdminController.createAdmin);
router.get('/admins', requireRole('superadmin'), superAdminController.listAdmins);

module.exports = router;