const express = require('express');
const router = express.Router();
const sharedAuthController = require('../controllers/sharedAuthController');

// POST /api/auth/login
router.post('/login', sharedAuthController.login);

module.exports = router;