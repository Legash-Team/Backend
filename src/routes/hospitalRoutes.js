const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');

/**
 * All routes here are protected and mounted with verifyToken + requireRole('hospital')
 */

// Dashboard
router.get('/dashboard', hospitalController.getDashboard);

// Profile
router.get('/profile', hospitalController.getProfile);
router.put('/profile', hospitalController.updateProfile);

// Blood Stock
router.get('/stock', hospitalController.getStock);
router.put('/stock', hospitalController.updateStock);

// Peer Hospital Geospatial Search
router.get('/search', hospitalController.searchHospitals);

module.exports = router;