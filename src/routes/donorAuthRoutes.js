const express = require('express');
const router = express.Router();
const donorAuthController = require('../controllers/donorAuthController');
const donorProfileController = require('../controllers/donorProfileController');
const donorValidators = require('../utils/validators/donorValidators');
const validateRequest = require('../middleware/validateRequest');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// 1. Public Authentication Routes (No Auth Required)
router.post('/register', donorValidators.register, validateRequest, donorAuthController.registerDonor);
router.post('/verify-otp', donorValidators.verifyOtp, validateRequest, donorAuthController.verifyDonorOtp);
router.post('/resend-otp', donorValidators.resendOtp, validateRequest, donorAuthController.resendDonorOtp);
router.post('/set-pin', donorValidators.setPin, validateRequest, donorAuthController.setDonorPin);
router.post('/unlock', donorValidators.unlock, validateRequest, donorAuthController.unlockDonor);
router.post('/forgot-pin', donorValidators.forgotPin, validateRequest, donorAuthController.forgotDonorPin);
router.post('/reset-pin', donorValidators.resetPin, validateRequest, donorAuthController.resetDonorPin);

// 2. Protected Donor Routes (Requires donor token)
router.use(verifyToken, requireRole('donor'));

router.get('/profile', donorProfileController.getProfile);
router.put('/profile', donorProfileController.updateProfile);
router.post('/profile/change-phone/request', donorProfileController.requestPhoneChange);
router.post('/profile/change-phone/confirm', donorProfileController.confirmPhoneChange);
router.post('/profile/change-pin', donorProfileController.changePin);
router.delete('/profile', donorProfileController.deleteAccount);
router.get('/blood-centers', donorProfileController.getBloodCenters);

module.exports = router;