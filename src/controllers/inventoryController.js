const Hospital = require('../models/Hospital');

// @desc    Get facility inventory
// @route   GET /v1/inventory
// @access  Private (Hospital)
exports.getInventory = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    return res.status(200).json({
      success: true,
      data: hospital.bloodStock
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create / Add / Update item in inventory
// @route   POST /v1/inventory
// @access  Private (Hospital)
exports.createInventoryItem = async (req, res, next) => {
  try {
    const { bloodType, availableUnits = 0, reservedUnits = 0 } = req.body;

    if (!bloodType) {
      return res.status(400).json({ success: false, error: 'bloodType is required' });
    }

    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    const stockItem = hospital.bloodStock.find(s => s.bloodType === bloodType);

    if (stockItem) {
      stockItem.availableUnits = Number(availableUnits);
      stockItem.reservedUnits = Number(reservedUnits);
    } else {
      hospital.bloodStock.push({
        bloodType,
        availableUnits: Number(availableUnits),
        reservedUnits: Number(reservedUnits)
      });
    }

    // Force Mongoose to register array modification
    hospital.markModified('bloodStock');
    await hospital.save();

    return res.status(201).json({
      success: true,
      message: 'Inventory item saved successfully',
      data: {
        bloodType,
        availableUnits: Number(availableUnits),
        reservedUnits: Number(reservedUnits)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update inventory units for a specific blood type
// @route   PUT /v1/inventory/:blood_type
// @access  Private (Hospital)
exports.updateInventoryUnits = async (req, res, next) => {
  try {
    const { blood_type } = req.params;
    const { availableUnits = 0, reservedUnits = 0 } = req.body;

    const hospital = await Hospital.findById(req.user.id);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    const stockItem = hospital.bloodStock.find(s => s.bloodType === blood_type);
    if (!stockItem) {
      return res.status(404).json({ success: false, error: `Blood type ${blood_type} not found` });
    }

    stockItem.availableUnits = Number(availableUnits);
    stockItem.reservedUnits = Number(reservedUnits);

    hospital.markModified('bloodStock');
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: `Inventory updated for ${blood_type}`,
      data: {
        bloodType: blood_type,
        availableUnits: Number(availableUnits),
        reservedUnits: Number(reservedUnits)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete / Clear inventory line
// @route   DELETE /v1/inventory/:blood_type
// @access  Private (Hospital)
exports.deleteInventoryLine = async (req, res, next) => {
  try {
    const { blood_type } = req.params;
    const hospital = await Hospital.findById(req.user.id);

    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    const stockItem = hospital.bloodStock.find(s => s.bloodType === blood_type);
    if (stockItem) {
      stockItem.availableUnits = 0;
      stockItem.reservedUnits = 0;
      hospital.markModified('bloodStock');
      await hospital.save();
    }

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// @desc    Configure inventory minimum safety thresholds
// @route   PUT /v1/inventory/thresholds
// @access  Private (Hospital)
exports.configureThresholds = async (req, res, next) => {
  try {
    const { thresholds } = req.body;
    const hospital = await Hospital.findById(req.user.id);

    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    if (Array.isArray(thresholds)) {
      thresholds.forEach(t => {
        const item = hospital.bloodStock.find(s => s.bloodType === t.bloodType);
        if (item) {
          item.minimumUnits = Number(t.minimumUnits);
        }
      });
      hospital.markModified('bloodStock');
      await hospital.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Safety thresholds updated successfully',
      data: { thresholds }
    });
  } catch (error) {
    next(error);
  }
};