const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// Public sub-admin invitation acceptance
router.post('/accept-invitation', superAdminController.acceptSubAdminInvitation);

// Super Admin Protected endpoints
router.use(verifyToken);

router.get('/pending-hospitals', requireRole('superadmin'), superAdminController.listPendingHospitals);
router.post('/hospitals/:id/approve', superAdminController.approveHospital);
router.post('/hospitals/:id/reject', superAdminController.rejectHospital);

router.get('/feedbacks', requireRole('superadmin'), superAdminController.listFeedbacks);

router.post('/events', superAdminController.createEvent);
router.get('/events', superAdminController.listAdminEvents);
router.delete('/events/:id', superAdminController.deleteEvent);

router.post('/create-subadmin', requireRole('superadmin'), superAdminController.createSubAdmin);
router.get('/sub-admins', requireRole('superadmin'), superAdminController.listSubAdmins);
router.get('/subadmins', requireRole('superadmin'), superAdminController.listSubAdmins);

module.exports = router;
