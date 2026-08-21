const express = require('express');
const router = express.Router();
const uploadMiddleware = require('../middleware/uploadMiddleware');
const uploadController = require('../controllers/uploadController');
const verifyToken = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// Gate file upload route to Admin and Super Admin roles only
router.post(
  '/',
  verifyToken,
  requireRole(['admin', 'superadmin']),
  uploadMiddleware.single('file'),
  uploadController.uploadMedia
);

module.exports = router;
