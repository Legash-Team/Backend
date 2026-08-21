// Backend/src/routes/donorAuthRoutes.js
const express = require('express');
const router = express.Router();
const donorAuthController = require('../controllers/donorAuthController');
const donorProfileController = require('../controllers/donorProfileController');
// const donorNotificationController = require('../controllers/donorNotificationController');
// const eventController = require('../controllers/eventController');
const donorValidators = require('../utils/validators/donorValidators');
const validateRequest = require('../middleware/validateRequest');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// Public Authentication Endpoints (No Passwords)
router.post('/register', donorValidators.register, validateRequest, donorAuthController.registerDonor);
router.post('/verify-otp', donorValidators.verifyOtp, validateRequest, donorAuthController.verifyDonorOtp);
router.post('/resend-otp', donorValidators.resendOtp, validateRequest, donorAuthController.resendDonorOtp);
router.post('/set-pin', donorValidators.setPin, validateRequest, donorAuthController.setDonorPin);
router.post('/forgot-pin', donorValidators.forgotPin, validateRequest, donorAuthController.forgotDonorPin);
router.post('/reset-pin', donorValidators.resetPin, validateRequest, donorAuthController.resetDonorPin);

// Protected Donor Operations
router.use(verifyToken, requireRole('donor'));

router.post('/unlock', donorValidators.unlock, validateRequest, donorAuthController.unlockDonor);
router.get('/profile', donorProfileController.getProfile);
router.put('/profile', donorProfileController.updateProfile);
router.post('/profile/change-phone/request', donorProfileController.requestPhoneChange);
router.post('/profile/change-phone/confirm', donorProfileController.confirmPhoneChange);
router.post('/profile/change-pin', donorProfileController.changePin);
router.delete('/profile', donorProfileController.deleteAccount);

// router.get('/notifications', donorNotificationController.list);
// router.post('/notifications/:id/respond', donorNotificationController.respond);
// router.post('/push-token', donorNotificationController.registerPushToken);
// router.get('/events', eventController.listPublicEvents);
router.get('/blood-centers', donorProfileController.getBloodCenters);

module.exports = router;