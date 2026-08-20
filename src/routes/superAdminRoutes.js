// Backend/src/routes/superAdminRoutes.js
const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// Public Sub-Admin invitation password setup
router.post('/accept-invitation', superAdminController.acceptSubAdminInvitation);

// Protected Super Admin / Admin endpoints
router.use(verifyToken);

// Pending hospital approvals & rejection
router.get('/hospitals/pending', requireRole('superadmin'), superAdminController.listPendingHospitals);
router.get('/pending-hospitals', requireRole('superadmin'), superAdminController.listPendingHospitals);
router.post('/hospitals/:id/approve', superAdminController.approveHospital);
router.post('/hospitals/:id/reject', superAdminController.rejectHospital);

// Feedbacks Management
router.get('/feedbacks', requireRole('superadmin'), superAdminController.listFeedbacks);
router.patch('/feedbacks/:id/reviewed', requireRole('superadmin'), superAdminController.markFeedbackReviewed);

// Events Management
router.post('/events', superAdminController.createEvent);
router.get('/events', superAdminController.listAdminEvents);
router.delete('/events/:id', superAdminController.deleteEvent);

// Admin / Sub-Admin Management
router.post('/admins', requireRole('superadmin'), superAdminController.createSubAdmin);
router.get('/admins', requireRole('superadmin'), superAdminController.listSubAdmins);

module.exports = router;