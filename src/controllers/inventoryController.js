const Hospital = require('../models/Hospital');

// Helper to extract hospital ID from JWT or custom header
const getHospitalId = (req) => {
  return req.user?.id || req.headers['x-hospital-id'] || req.headers['x-facility-id'];
};

// @desc    Get facility inventory
// @route   GET /v1/inventory
// @access  Private (Hospital)
exports.getInventory = async (req, res, next) => {
  try {
    const hospitalId = getHospitalId(req);
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    // Attach hospitalId and facilityId to every inventory item
    const formattedStock = hospital.bloodStock.map(item => ({
      hospitalId: hospital._id.toString(),
      facilityId: hospital._id.toString(),
      bloodType: item.bloodType,
      availableUnits: item.availableUnits || 0,
      reservedUnits: item.reservedUnits || 0,
      minimumUnits: item.minimumUnits || 0,
      quantity: (item.availableUnits || 0) + (item.reservedUnits || 0)
    }));

    return res.status(200).json({
      success: true,
      data: formattedStock
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

    const hospitalId = getHospitalId(req);
    const hospital = await Hospital.findById(hospitalId);
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
        reservedUnits: Number(reservedUnits),
        minimumUnits: 0
      });
    }

    hospital.markModified('bloodStock');
    await hospital.save();

    return res.status(201).json({
      success: true,
      message: 'Inventory item saved successfully',
      data: {
        hospitalId: hospital._id.toString(),
        facilityId: hospital._id.toString(),
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
    const blood_type = req.params.blood_type || req.params.bloodType;
    const { availableUnits = 0, reservedUnits = 0 } = req.body;

    const hospitalId = getHospitalId(req);
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    let stockItem = hospital.bloodStock.find(s => s.bloodType === blood_type);
    if (!stockItem) {
      hospital.bloodStock.push({
        bloodType: blood_type,
        availableUnits: Number(availableUnits),
        reservedUnits: Number(reservedUnits),
        minimumUnits: 0
      });
      stockItem = hospital.bloodStock.find(s => s.bloodType === blood_type);
    } else {
      stockItem.availableUnits = Number(availableUnits);
      stockItem.reservedUnits = Number(reservedUnits);
    }

    hospital.markModified('bloodStock');
    await hospital.save();

    return res.status(200).json({
      success: true,
      message: `Inventory updated for ${blood_type}`,
      data: {
        hospitalId: hospital._id.toString(),
        facilityId: hospital._id.toString(),
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
    const blood_type = req.params.blood_type || req.params.bloodType;
    const hospitalId = getHospitalId(req);
    const hospital = await Hospital.findById(hospitalId);

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
    const hospitalId = getHospitalId(req);
    const hospital = await Hospital.findById(hospitalId);

    if (!hospital) {
      return res.status(404).json({ success: false, error: 'Hospital not found' });
    }

    const thresholdsList = Array.isArray(thresholds) ? thresholds : [];

    thresholdsList.forEach(t => {
      let item = hospital.bloodStock.find(s => s.bloodType === t.bloodType);
      if (item) {
        item.minimumUnits = Number(t.minimumUnits);
      } else {
        hospital.bloodStock.push({
          bloodType: t.bloodType,
          availableUnits: 0,
          reservedUnits: 0,
          minimumUnits: Number(t.minimumUnits)
        });
      }
    });

    hospital.markModified('bloodStock');
    await hospital.save();

    // Returns array directly to match test expectation
    return res.status(200).json({
      success: true,
      message: 'Safety thresholds updated successfully',
      data: thresholdsList
    });
  } catch (error) {
    next(error);
  }
};