const express = require('express');
const router = express.Router();
const hospitalAuthController = require('../controllers/hospitalAuthController');
const { validateHospitalRegistration } = require('../middleware/validators');

// POST /api/hospitals/register
router.post('/register', validateHospitalRegistration, hospitalAuthController.registerHospital);

module.exports = router;