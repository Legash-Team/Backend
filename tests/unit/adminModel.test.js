// tests/unit/adminModel.test.js
const Admin = require('../../src/models/Admin');

describe('Unit Tests: Admin Model Schema & Blood Center Fields', () => {
  beforeEach(async () => {
    await Admin.deleteMany({});
  });

  describe('Backward Compatibility', () => {
    test('successfully saves an admin without centerName, phone, or location', async () => {
      const adminData = {
        name: 'Standard Admin',
        email: 'standard.admin@legash.org',
        permissions: {
          canApproveHospitals: true,
          canPostEvents: false
        }
      };

      const admin = await Admin.create(adminData);

      expect(admin._id).toBeDefined();
      expect(admin.name).toBe('Standard Admin');
      expect(admin.email).toBe('standard.admin@legash.org');
      expect(admin.centerName).toBeNull();
      expect(admin.phone).toBeNull();
      expect(admin.location).toBeUndefined();
    });

    test('validates existing records lacking the new fields when saved', async () => {
      const admin = new Admin({
        name: 'Legacy Admin',
        email: 'legacy.admin@legash.org'
      });

      const validationError = admin.validateSync();
      expect(validationError).toBeUndefined();

      await admin.save();
      const fetched = await Admin.findById(admin._id);
      expect(fetched).toBeDefined();
      expect(fetched.name).toBe('Legacy Admin');
    });
  });

  describe('Blood Center & Contact Fields', () => {
    test('successfully saves an admin with centerName, phone, and GeoJSON location', async () => {
      const centerAdminData = {
        name: 'Center Director',
        email: 'director@aabloodbank.gov.et',
        centerName: '  Addis Ababa Regional Blood Bank Center  ',
        phone: '  +251115510000  ',
        location: {
          coordinates: [38.751, 9.015],
          address: 'Stadium Area, Addis Ababa'
        }
      };

      const admin = await Admin.create(centerAdminData);

      expect(admin.centerName).toBe('Addis Ababa Regional Blood Bank Center');
      expect(admin.phone).toBe('+251115510000');
      expect(admin.location).toBeDefined();
      expect(admin.location.type).toBe('Point');
      expect(admin.location.coordinates).toEqual([38.751, 9.015]);
      expect(admin.location.address).toBe('Stadium Area, Addis Ababa');
    });

    test('accepts location with only coordinates, defaulting type to Point', async () => {
      const admin = await Admin.create({
        name: 'Minimal Loc Admin',
        email: 'minimal.loc@legash.org',
        location: {
          coordinates: [38.74, 9.03]
        }
      });

      expect(admin.location.type).toBe('Point');
      expect(admin.location.coordinates).toEqual([38.74, 9.03]);
      expect(admin.location.address).toBeUndefined();
    });

    test('fails validation if location is provided without coordinates', async () => {
      const admin = new Admin({
        name: 'No Coords Admin',
        email: 'no.coords@legash.org',
        location: {
          address: 'Addis Ababa'
        }
      });

      const validationError = admin.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors['location.coordinates']).toBeDefined();
    });

    test('fails validation if location type is not Point', async () => {
      const admin = new Admin({
        name: 'Invalid Type Admin',
        email: 'invalid.type@legash.org',
        location: {
          type: 'Polygon',
          coordinates: [38.74, 9.03]
        }
      });

      const validationError = admin.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors['location.type']).toBeDefined();
    });

    test('defaults termsAccepted to false and persists true when provided', async () => {
      const defaultAdmin = await Admin.create({
        name: 'Terms Default Admin',
        email: 'terms.default@legash.org'
      });
      expect(defaultAdmin.termsAccepted).toBe(false);

      const acceptedAdmin = await Admin.create({
        name: 'Terms Accepted Admin',
        email: 'terms.accepted@legash.org',
        termsAccepted: true
      });
      expect(acceptedAdmin.termsAccepted).toBe(true);
    });
  });

  describe('Indexes', () => {
    test('defines 2dsphere index on location field', async () => {
      await Admin.syncIndexes();
      const indexes = Admin.schema.indexes();
      const has2dsphere = indexes.some(([indexDef]) => indexDef.location === '2dsphere');
      expect(has2dsphere).toBe(true);
    });

    test('multiple admins with and without location can coexist in database with 2dsphere index', async () => {
      await Admin.syncIndexes();

      // Admin 1: without location
      const a1 = await Admin.create({
        name: 'No Loc 1',
        email: 'noloc1@legash.org'
      });

      // Admin 2: without location
      const a2 = await Admin.create({
        name: 'No Loc 2',
        email: 'noloc2@legash.org'
      });

      // Admin 3: with location
      const a3 = await Admin.create({
        name: 'With Loc 1',
        email: 'withloc1@legash.org',
        location: { coordinates: [38.75, 9.03] }
      });

      expect(a1._id).toBeDefined();
      expect(a2._id).toBeDefined();
      expect(a3._id).toBeDefined();
    });
  });
});
