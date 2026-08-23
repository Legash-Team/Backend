// tests/unit/bloodStockController.test.js
const hospitalController = require('../../src/controllers/hospitalController');
const Hospital = require('../../src/models/Hospital');

jest.mock('../../src/models/Hospital');

describe('Unit Tests: Hospital Blood Stock Controller', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { id: 'hospital_123' },
      body: {},
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('updateAllBloodStock', () => {
    it('should atomically update all 8 blood types simultaneously from map payload', async () => {
      const mockHospital = {
        _id: 'hospital_123',
        bloodStock: [
          { bloodType: 'A+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
          { bloodType: 'A-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
          { bloodType: 'B+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
          { bloodType: 'B-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
          { bloodType: 'AB+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
          { bloodType: 'AB-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
          { bloodType: 'O+', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
          { bloodType: 'O-', availableUnits: 0, reservedUnits: 0, minimumUnits: 0 },
        ],
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(true),
      };

      Hospital.findById = jest.fn().mockResolvedValue(mockHospital);

      req.body = {
        bloodStock: {
          'A+': 12,
          'A-': 4,
          'B+': 7,
          'B-': 3,
          'AB+': 9,
          'AB-': 2,
          'O+': 25,
          'O-': 8,
        },
      };

      await hospitalController.updateAllBloodStock(req, res, next);

      expect(Hospital.findById).toHaveBeenCalledWith('hospital_123');
      expect(mockHospital.markModified).toHaveBeenCalledWith('bloodStock');
      expect(mockHospital.save).toHaveBeenCalledTimes(1);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Blood stock inventory updated successfully.',
          stock: {
            'A+': 12,
            'A-': 4,
            'B+': 7,
            'B-': 3,
            'AB+': 9,
            'AB-': 2,
            'O+': 25,
            'O-': 8,
          },
        })
      );
    });

    it('should reject invalid negative quantities', async () => {
      const mockHospital = {
        _id: 'hospital_123',
        bloodStock: [],
        markModified: jest.fn(),
        save: jest.fn(),
      };

      Hospital.findById = jest.fn().mockResolvedValue(mockHospital);

      req.body = {
        bloodStock: {
          'A+': -5,
        },
      };

      await hospitalController.updateAllBloodStock(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('cannot be negative'),
        })
      );
      expect(mockHospital.save).not.toHaveBeenCalled();
    });
  });
});
