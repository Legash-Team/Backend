// Backend/src/routes/sharedAuthRoutes.js
const express = require('express');
const router = express.Router();
const sharedAuthController = require('../controllers/sharedAuthController');

// Shared Unified Login (Hospital, Super Admin, Admin)
router.post('/login', sharedAuthController.login);

// Shared Forgot & Reset Password
router.post('/forgot-password', sharedAuthController.forgotPassword);
router.post('/reset-password', sharedAuthController.resetPassword);

// Admin Password Setup
router.post('/admin/setup', sharedAuthController.adminSetup);

module.exports = router;