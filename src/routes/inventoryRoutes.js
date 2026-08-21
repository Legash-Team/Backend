const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const verifyToken = require('../middleware/authMiddleware');

// Protect all routes with JWT authentication
router.use(verifyToken);

router.route('/')
  .get(inventoryController.getInventory)
  .post(inventoryController.createInventoryItem);

router.put('/thresholds', inventoryController.configureThresholds);

router.route('/:blood_type')
  .put(inventoryController.updateInventoryUnits)
  .delete(inventoryController.deleteInventoryLine);

module.exports = router;
