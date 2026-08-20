const request = require('supertest');
const app = require('../../server');
const Hospital = require('../../src/models/Hospital');
const generateToken = require('../../src/utils/generateToken');
const { hashPassword } = require('../../src/utils/hashPassword');

describe('Issue #32 & #33: Hospital Controller & Routes Integration Tests', () => {
  let mainHospital, peerHospital, hospitalToken, _peerToken;

  const validStockArray = [
    { bloodType: 'A+', availableUnits: 10, reservedUnits: 2, minimumUnits: 5 },
    { bloodType: 'A-', availableUnits: 5, reservedUnits: 0, minimumUnits: 2 },
    { bloodType: 'B+', availableUnits: 8, reservedUnits: 1, minimumUnits: 3 },
    { bloodType: 'B-', availableUnits: 4, reservedUnits: 0, minimumUnits: 2 },
    { bloodType: 'AB+', availableUnits: 6, reservedUnits: 0, minimumUnits: 2 },
    { bloodType: 'AB-', availableUnits: 2, reservedUnits: 0, minimumUnits: 1 },
    { bloodType: 'O+', availableUnits: 20, reservedUnits: 5, minimumUnits: 10 },
    { bloodType: 'O-', availableUnits: 15, reservedUnits: 3, minimumUnits: 8 },
  ];

  beforeEach(async () => {
    await Hospital.deleteMany({});

    mainHospital = await Hospital.create({
      hospitalName: 'St. Paul Hospital',
      licenseNumber: 'LIC-MAIN-001',
      phone: '+251911001122',
      email: 'stpaul@legash.org',
      passwordHash: await hashPassword('StrongPassword123!'),
      location: { type: 'Point', coordinates: [38.75, 9.03], address: 'Addis Ababa' },
      emailVerified: true,
      verificationStatus: 'approved',
      bloodStock: validStockArray,
    });
    hospitalToken = generateToken({ id: mainHospital._id, role: 'hospital' });

    peerHospital = await Hospital.create({
      hospitalName: 'Black Lion Hospital',
      licenseNumber: 'LIC-PEER-002',
      phone: '+251911003344',
      email: 'blacklion@legash.org',
      passwordHash: await hashPassword('StrongPassword123!'),
      location: { type: 'Point', coordinates: [38.76, 9.04], address: 'Addis Ababa' },
      emailVerified: true,
      verificationStatus: 'approved',
      bloodStock: [
        { bloodType: 'A+', availableUnits: 15, reservedUnits: 0 },
        { bloodType: 'A-', availableUnits: 0, reservedUnits: 0 },
        { bloodType: 'B+', availableUnits: 0, reservedUnits: 0 },
        { bloodType: 'B-', availableUnits: 0, reservedUnits: 0 },
        { bloodType: 'AB+', availableUnits: 0, reservedUnits: 0 },
        { bloodType: 'AB-', availableUnits: 0, reservedUnits: 0 },
        { bloodType: 'O+', availableUnits: 0, reservedUnits: 0 },
        { bloodType: 'O-', availableUnits: 25, reservedUnits: 2 },
      ],
    });
    _peerToken = generateToken({ id: peerHospital._id, role: 'hospital' });

    await Hospital.createIndexes();
  });

  // 1. Dashboard
  describe('GET /api/hospital/dashboard', () => {
    it('returns sanitized dashboard with coordinates formatted as { lat, lng }', async () => {
      const res = await request(app)
        .get('/api/hospital/dashboard')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hospital.hospitalName).toBe('St. Paul Hospital');
      expect(res.body.hospital.location).toEqual({
        lat: 9.03,
        lng: 38.75,
        address: 'Addis Ababa',
      });
      expect(res.body.hospital.bloodStock).toHaveLength(8);
      expect(res.body.hospital.passwordHash).toBeUndefined();
      expect(res.body.hospital.verificationToken).toBeUndefined();
    });

    it('rejects unauthenticated requests (401)', async () => {
      const res = await request(app).get('/api/hospital/dashboard');
      expect(res.status).toBe(401);
    });
  });

  // 2. Profile Update
  describe('PUT /api/hospital/profile', () => {
    it('updates name and phone without changing email status', async () => {
      const res = await request(app)
        .put('/api/hospital/profile')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          hospitalName: 'St. Paul Millennium Hospital Updated',
          phone: '+251911999888',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.profile.hospitalName).toBe('St. Paul Millennium Hospital Updated');
      expect(res.body.profile.phone).toBe('+251911999888');

      const updated = await Hospital.findById(mainHospital._id);
      expect(updated.emailVerified).toBe(true);
      expect(updated.verificationStatus).toBe('approved');
    });

    it('changing email resets emailVerified to false and maintains approved status', async () => {
      const res = await request(app)
        .put('/api/hospital/profile')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          email: 'newemail@stpaul.org',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.profile.emailVerified).toBe(false);

      const updated = await Hospital.findById(mainHospital._id);
      expect(updated.email).toBe('newemail@stpaul.org');
      expect(updated.emailVerified).toBe(false);
      expect(updated.verificationStatus).toBe('approved');
    });

    it('rejects duplicate email with 409 Conflict', async () => {
      const res = await request(app)
        .put('/api/hospital/profile')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          email: 'blacklion@legash.org',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/already registered/i);
    });
  });

  // 3. Stock Management
  describe('GET & PUT /api/hospital/stock', () => {
    it('GET /api/hospital/stock returns the blood stock array', async () => {
      const res = await request(app)
        .get('/api/hospital/stock')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.bloodStock).toHaveLength(8);
    });

    it('PUT /api/hospital/stock updates the full 8-type stock', async () => {
      const updatedStock = validStockArray.map(item => ({
        ...item,
        availableUnits: item.availableUnits + 5,
      }));

      const res = await request(app)
        .put('/api/hospital/stock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ stock: updatedStock });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.bloodStock.find(s => s.bloodType === 'O-').availableUnits).toBe(20);
    });

    it('PUT /api/hospital/stock rejects if any of the 8 types is missing (400)', async () => {
      const incompleteStock = validStockArray.slice(0, 7);

      const res = await request(app)
        .put('/api/hospital/stock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ stock: incompleteStock });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/All 8 blood types must be provided/i);
    });

    it('PUT /api/hospital/stock rejects negative quantities (400)', async () => {
      const invalidStock = validStockArray.map((item, idx) =>
        idx === 0 ? { ...item, availableUnits: -5 } : item
      );

      const res = await request(app)
        .put('/api/hospital/stock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ stock: invalidStock });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/must be non-negative/i);
    });
  });

  // 4. Geospatial Peer Search
  describe('GET /api/hospital/search', () => {
    it('finds nearby approved peer hospitals having available stock of requested blood type', async () => {
      const res = await request(app)
        .get('/api/hospital/search?bloodType=O-&quantity=5&radiusKm=25')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hospitals).toHaveLength(1);
      expect(res.body.hospitals[0].hospitalName).toBe('Black Lion Hospital');
      expect(res.body.hospitals[0].availableUnits).toBe(25);
      expect(res.body.hospitals[0].hasSufficientStock).toBe(true);
    });

    it('excludes the requesting hospital from search results', async () => {
      const res = await request(app)
        .get('/api/hospital/search?bloodType=O-')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(res.status).toBe(200);
      const hospitalIds = res.body.hospitals.map(h => h.id.toString());
      expect(hospitalIds).not.toContain(mainHospital._id.toString());
    });
  });
});