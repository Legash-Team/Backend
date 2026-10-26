// Backend/src/routes/sharedAuthRoutes.js
const express = require('express');
const router = express.Router();
const sharedAuthController = require('../controllers/sharedAuthController');

const verifyToken = require('../middleware/authMiddleware');

// Shared Unified Login (Hospital, Super Admin, Admin)
router.post('/login', sharedAuthController.login);
router.get('/me', verifyToken, sharedAuthController.getMe);

// Shared Forgot & Reset Password
router.post('/forgot-password', sharedAuthController.forgotPassword);
router.post('/reset-password', sharedAuthController.resetPassword);

// Admin Password Setup
router.get('/admin/setup', sharedAuthController.getAdminSetupContext);
router.post('/admin/setup', sharedAuthController.adminSetup);

module.exports = router;