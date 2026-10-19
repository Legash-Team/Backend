const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Hospital = require('../../src/models/Hospital');
const SuperAdmin = require('../../src/models/SuperAdmin');
const Admin = require('../../src/models/Admin');
const HospitalStockSnapshot = require('../../src/models/HospitalStockSnapshot');
const generateToken = require('../../src/utils/generateToken');
const { VALID_BLOOD_TYPES } = require('../../src/utils/bloodCompatibility');

describe('Super Admin Hospital Stock & Analytics API Integration Tests', () => {
  let superAdmin;
  let superAdminToken;
  let adminWithApprove;
  let adminWithApproveToken;
  let adminWithoutApprove;
  let adminWithoutApproveToken;

  beforeEach(async () => {
    await Hospital.deleteMany({});
    await SuperAdmin.deleteMany({});
    await Admin.deleteMany({});
    await HospitalStockSnapshot.deleteMany({});

    superAdmin = await SuperAdmin.create({
      name: 'Root SuperAdmin',
      email: 'root@legash.org',
      passwordHash: 'dummyhash'
    });
    superAdminToken = generateToken({
      id: superAdmin._id.toString(),
      role: 'superadmin'
    });

    adminWithApprove = await Admin.create({
      name: 'Approver Admin',
      email: 'approver@legash.org',
      emailVerified: true,
      permissions: { canApproveHospitals: true, canPostEvents: false }
    });
    adminWithApproveToken = generateToken({
      id: adminWithApprove._id.toString(),
      role: 'admin',
      permissions: adminWithApprove.permissions
    });

    adminWithoutApprove = await Admin.create({
      name: 'No Appr Admin',
      email: 'noappr@legash.org',
      emailVerified: true,
      permissions: { canApproveHospitals: false, canPostEvents: false }
    });
    adminWithoutApproveToken = generateToken({
      id: adminWithoutApprove._id.toString(),
      role: 'admin',
      permissions: adminWithoutApprove.permissions
    });
  });

  describe('Authorization for both routes', () => {
    const endpoints = ['/api/superadmin/hospitals/stock', '/api/superadmin/analytics/hospitals'];

    test.each(endpoints)('rejects %s with 401 when no token is provided', async (url) => {
      const res = await request(app).get(url);
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test.each(endpoints)('rejects %s with 403 for hospital token', async (url) => {
      const hospitalToken = generateToken({
        id: new mongoose.Types.ObjectId().toString(),
        role: 'hospital'
      });
      const res = await request(app).get(url).set('Authorization', `Bearer ${hospitalToken}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test.each(endpoints)('rejects %s with 403 for donor token', async (url) => {
      const donorToken = generateToken({
        id: new mongoose.Types.ObjectId().toString(),
        role: 'donor'
      });
      const res = await request(app).get(url).set('Authorization', `Bearer ${donorToken}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test.each(endpoints)(
      'rejects %s with 403 for Admin without canApproveHospitals',
      async (url) => {
        const res = await request(app)
          .get(url)
          .set('Authorization', `Bearer ${adminWithoutApproveToken}`);
        expect(res.statusCode).toBe(403);
        expect(res.body.success).toBe(false);
      }
    );

    test.each(endpoints)(
      'rejects %s with 403 for Admin even with canApproveHospitals (Super Admin only)',
      async (url) => {
        const res = await request(app)
          .get(url)
          .set('Authorization', `Bearer ${adminWithApproveToken}`);
        expect(res.statusCode).toBe(403);
        expect(res.body.success).toBe(false);
      }
    );

    test.each(endpoints)('permits %s with 200 for Super Admin', async (url) => {
      const res = await request(app).get(url).set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Route order and coexistence with existing routes', () => {
    test('GET /api/superadmin/hospitals/stock returns 200 and is not captured by other routes', async () => {
      const res = await request(app)
        .get('/api/superadmin/hospitals/stock')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('hospitals');
    });

    test('existing GET /api/superadmin/hospitals/pending still returns 200', async () => {
      const res = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('hospitals');
    });
  });

  describe('GET /api/superadmin/hospitals/stock', () => {
    test('empty database returns status 200 with empty list and zero counts', async () => {
      const res = await request(app)
        .get('/api/superadmin/hospitals/stock')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hospitals).toEqual([]);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
      });
    });

    test('excludes pending, rejected, and soft-deleted hospitals', async () => {
      // Approved hospital
      await Hospital.create({
        hospitalName: 'Approved Hospital',
        licenseNumber: 'LIC-APP-1',
        phone: '+251911111111',
        email: 'app@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03], address: 'Addis Ababa' },
        verificationStatus: 'approved',
        bloodStock: [{ bloodType: 'A+', availableUnits: 10 }]
      });

      // Pending hospital
      await Hospital.create({
        hospitalName: 'Pending Hospital',
        licenseNumber: 'LIC-PEND-1',
        phone: '+251911111112',
        email: 'pend@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03], address: 'Addis Ababa' },
        verificationStatus: 'pending',
        bloodStock: [{ bloodType: 'A+', availableUnits: 20 }]
      });

      // Rejected hospital
      await Hospital.create({
        hospitalName: 'Rejected Hospital',
        licenseNumber: 'LIC-REJ-1',
        phone: '+251911111113',
        email: 'rej@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03], address: 'Addis Ababa' },
        verificationStatus: 'rejected',
        bloodStock: [{ bloodType: 'A+', availableUnits: 30 }]
      });

      // Soft-deleted hospital
      await Hospital.create({
        hospitalName: 'Deleted Hospital',
        licenseNumber: 'LIC-DEL-1',
        phone: '+251911111114',
        email: 'del@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03], address: 'Addis Ababa' },
        verificationStatus: 'approved',
        isDeleted: true,
        bloodStock: [{ bloodType: 'A+', availableUnits: 40 }]
      });

      const res = await request(app)
        .get('/api/superadmin/hospitals/stock')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.hospitals).toHaveLength(1);
      expect(res.body.hospitals[0].hospitalName).toBe('Approved Hospital');
    });

    test('approved hospital with empty/partial stock shows 0 for missing types, ignores reservedUnits/minimumUnits, and excludes private fields', async () => {
      const hosp = await Hospital.create({
        hospitalName: 'St. Mary Hospital',
        licenseNumber: 'LIC-MARY-01',
        phone: '+251911223344',
        email: 'stmary@legash.org',
        passwordHash: 'secret-hash-must-not-leak',
        verificationOtp: '123456',
        resetCode: '654321',
        location: { coordinates: [38.75, 9.02], address: 'Kirkos, Addis Ababa' },
        verificationStatus: 'approved',
        bloodStock: [
          { bloodType: 'A+', availableUnits: 15, reservedUnits: 100, minimumUnits: 50 },
          { bloodType: 'O-', availableUnits: 3, reservedUnits: 200, minimumUnits: 10 }
        ]
      });

      const res = await request(app)
        .get('/api/superadmin/hospitals/stock')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.hospitals).toHaveLength(1);
      const row = res.body.hospitals[0];

      expect(row.id).toBe(hosp._id.toString());
      expect(row.hospitalName).toBe('St. Mary Hospital');
      expect(row.phone).toBe('+251911223344');
      expect(row.location).toEqual({ lat: 9.02, lng: 38.75, address: 'Kirkos, Addis Ababa' });
      expect(row.stock['A+']).toBe(15);
      expect(row.stock['O-']).toBe(3);
      expect(row.stock['B+']).toBe(0);
      expect(row.stock['AB+']).toBe(0);
      expect(row.totalUnits).toBe(18);

      // Verify strict exclusion of private fields
      expect(row.email).toBeUndefined();
      expect(row.licenseNumber).toBeUndefined();
      expect(row.passwordHash).toBeUndefined();
      expect(row.verificationOtp).toBeUndefined();
      expect(row.resetCode).toBeUndefined();
      expect(row.pendingEmail).toBeUndefined();
      expect(row.rejectionReason).toBeUndefined();
      expect(row.emailVerified).toBeUndefined();
      expect(row.agreedToTerms).toBeUndefined();
    });

    test('bloodType filter works with A%2B, unencoded A+, and O-', async () => {
      await Hospital.create({
        hospitalName: 'Filter Hospital',
        licenseNumber: 'LIC-FILT-1',
        phone: '+251911999888',
        email: 'filter@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        bloodStock: [
          { bloodType: 'A+', availableUnits: 12 },
          { bloodType: 'O-', availableUnits: 7 }
        ]
      });

      // Filter with encoded A%2B
      const resEncoded = await request(app)
        .get('/api/superadmin/hospitals/stock?bloodType=A%2B')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resEncoded.statusCode).toBe(200);
      expect(resEncoded.body.hospitals[0].stock).toEqual({ 'A+': 12 });
      expect(resEncoded.body.hospitals[0].totalUnits).toBe(12);

      // Filter with unencoded A+ (Express decodes to "A ")
      const resUnencoded = await request(app)
        .get('/api/superadmin/hospitals/stock?bloodType=A+')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resUnencoded.statusCode).toBe(200);
      expect(resUnencoded.body.hospitals[0].stock).toEqual({ 'A+': 12 });
      expect(resUnencoded.body.hospitals[0].totalUnits).toBe(12);

      // Filter with O-
      const resONeg = await request(app)
        .get('/api/superadmin/hospitals/stock?bloodType=O-')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resONeg.statusCode).toBe(200);
      expect(resONeg.body.hospitals[0].stock).toEqual({ 'O-': 7 });
      expect(resONeg.body.hospitals[0].totalUnits).toBe(7);
    });

    test('rejects invalid bloodType with 400', async () => {
      const resZ = await request(app)
        .get('/api/superadmin/hospitals/stock?bloodType=Z+')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resZ.statusCode).toBe(400);
      expect(resZ.body.success).toBe(false);

      const resLower = await request(app)
        .get('/api/superadmin/hospitals/stock?bloodType=a+')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resLower.statusCode).toBe(400);
      expect(resLower.body.success).toBe(false);

      const resMulti = await request(app)
        .get('/api/superadmin/hospitals/stock?bloodType=A+&bloodType=B+')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resMulti.statusCode).toBe(400);
      expect(resMulti.body.success).toBe(false);
    });

    test('rejects invalid sortBy, order, page, and limit with 400', async () => {
      const cases = [
        '?sortBy=invalidSort',
        '?order=sideways',
        '?page=0',
        '?page=-1',
        '?page=abc',
        '?limit=0',
        '?limit=101',
        '?limit=xyz'
      ];

      for (const query of cases) {
        const res = await request(app)
          .get(`/api/superadmin/hospitals/stock${query}`)
          .set('Authorization', `Bearer ${superAdminToken}`);
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });

    test('sorting by totalUnits and hospitalName in asc and desc with tie-breaker', async () => {
      await Hospital.create([
        {
          hospitalName: 'Beta Hospital',
          licenseNumber: 'L-B',
          phone: '+251911000001',
          email: 'b@legash.org',
          passwordHash: 'dummy',
          location: { coordinates: [38.74, 9.03] },
          verificationStatus: 'approved',
          bloodStock: [{ bloodType: 'A+', availableUnits: 20 }]
        },
        {
          hospitalName: 'Alpha Hospital',
          licenseNumber: 'L-A',
          phone: '+251911000002',
          email: 'a@legash.org',
          passwordHash: 'dummy',
          location: { coordinates: [38.74, 9.03] },
          verificationStatus: 'approved',
          bloodStock: [{ bloodType: 'A+', availableUnits: 20 }] // tie on totalUnits
        },
        {
          hospitalName: 'Gamma Hospital',
          licenseNumber: 'L-G',
          phone: '+251911000003',
          email: 'g@legash.org',
          passwordHash: 'dummy',
          location: { coordinates: [38.74, 9.03] },
          verificationStatus: 'approved',
          bloodStock: [{ bloodType: 'A+', availableUnits: 50 }]
        }
      ]);

      // Sort by totalUnits descending: Gamma (50), then tie Alpha/Beta sorted by name -> Alpha, then Beta
      const resUnitsDesc = await request(app)
        .get('/api/superadmin/hospitals/stock?sortBy=totalUnits&order=desc')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resUnitsDesc.statusCode).toBe(200);
      expect(resUnitsDesc.body.hospitals.map((h) => h.hospitalName)).toEqual([
        'Gamma Hospital',
        'Alpha Hospital',
        'Beta Hospital'
      ]);

      // Sort by hospitalName ascending: Alpha, Beta, Gamma
      const resNameAsc = await request(app)
        .get('/api/superadmin/hospitals/stock?sortBy=hospitalName&order=asc')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resNameAsc.statusCode).toBe(200);
      expect(resNameAsc.body.hospitals.map((h) => h.hospitalName)).toEqual([
        'Alpha Hospital',
        'Beta Hospital',
        'Gamma Hospital'
      ]);

      // Sort by hospitalName descending: Gamma, Beta, Alpha
      const resNameDesc = await request(app)
        .get('/api/superadmin/hospitals/stock?sortBy=hospitalName&order=desc')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resNameDesc.statusCode).toBe(200);
      expect(resNameDesc.body.hospitals.map((h) => h.hospitalName)).toEqual([
        'Gamma Hospital',
        'Beta Hospital',
        'Alpha Hospital'
      ]);
    });

    test('pagination handling and requesting a page beyond total pages', async () => {
      for (let i = 1; i <= 5; i++) {
        await Hospital.create({
          hospitalName: `Hospital ${i}`,
          licenseNumber: `L-${i}`,
          phone: `+25191100001${i}`,
          email: `h${i}@legash.org`,
          passwordHash: 'dummy',
          location: { coordinates: [38.74, 9.03] },
          verificationStatus: 'approved',
          bloodStock: [{ bloodType: 'A+', availableUnits: i }]
        });
      }

      // Page 1 with limit 2
      const resP1 = await request(app)
        .get('/api/superadmin/hospitals/stock?page=1&limit=2')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resP1.statusCode).toBe(200);
      expect(resP1.body.hospitals).toHaveLength(2);
      expect(resP1.body.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });

      // Page 3 with limit 2 (last page, 1 item)
      const resP3 = await request(app)
        .get('/api/superadmin/hospitals/stock?page=3&limit=2')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resP3.statusCode).toBe(200);
      expect(resP3.body.hospitals).toHaveLength(1);

      // Page 4 with limit 2 (past end -> returns empty list, not an error)
      const resP4 = await request(app)
        .get('/api/superadmin/hospitals/stock?page=4&limit=2')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(resP4.statusCode).toBe(200);
      expect(resP4.body.hospitals).toEqual([]);
      expect(resP4.body.pagination).toEqual({ page: 4, limit: 2, total: 5, totalPages: 3 });
    });
  });

  describe('GET /api/superadmin/analytics/hospitals', () => {
    test('empty database returns all zeros with eight keys, empty arrays, and 200', async () => {
      const res = await request(app)
        .get('/api/superadmin/analytics/hospitals')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.analytics).toMatchObject({
        approvedHospitalCount: 0,
        national: {
          totalUnits: 0,
          byBloodType: {
            'A+': 0,
            'A-': 0,
            'B+': 0,
            'B-': 0,
            'AB+': 0,
            'AB-': 0,
            'O+': 0,
            'O-': 0
          }
        },
        topHospitals: [],
        bottomHospitals: [],
        trends: {
          last30Days: [],
          last90Days: []
        }
      });
      expect(new Date(res.body.analytics.generatedAt).getTime()).not.toBeNaN();
    });

    test('national totals match fixtures, only availableUnits counts, unapproved/deleted excluded', async () => {
      // Approved hospital 1
      await Hospital.create({
        hospitalName: 'Hospital One',
        licenseNumber: 'LIC-001',
        phone: '+251911000111',
        email: 'one@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        bloodStock: [
          { bloodType: 'A+', availableUnits: 10, reservedUnits: 50 },
          { bloodType: 'O+', availableUnits: 25, reservedUnits: 100 }
        ]
      });

      // Approved hospital 2
      await Hospital.create({
        hospitalName: 'Hospital Two',
        licenseNumber: 'LIC-002',
        phone: '+251911000222',
        email: 'two@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        bloodStock: [
          { bloodType: 'A+', availableUnits: 5, reservedUnits: 500 },
          { bloodType: 'B-', availableUnits: 8, reservedUnits: 200 }
        ]
      });

      // Pending hospital (excluded)
      await Hospital.create({
        hospitalName: 'Pending Hospital',
        licenseNumber: 'LIC-003',
        phone: '+251911000333',
        email: 'three@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'pending',
        bloodStock: [{ bloodType: 'A+', availableUnits: 1000 }]
      });

      // Deleted hospital (excluded)
      await Hospital.create({
        hospitalName: 'Deleted Hospital',
        licenseNumber: 'LIC-004',
        phone: '+251911000444',
        email: 'four@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        isDeleted: true,
        bloodStock: [{ bloodType: 'A+', availableUnits: 2000 }]
      });

      const res = await request(app)
        .get('/api/superadmin/analytics/hospitals')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.analytics.approvedHospitalCount).toBe(2);
      expect(res.body.analytics.national.totalUnits).toBe(48); // (10 + 25) + (5 + 8) = 48
      expect(res.body.analytics.national.byBloodType).toEqual({
        'A+': 15,
        'A-': 0,
        'B+': 0,
        'B-': 8,
        'AB+': 0,
        'AB-': 0,
        'O+': 25,
        'O-': 0
      });
    });

    test('top and bottom lists hold at most 10 items (creating 12 hospitals) with correct sort and tie-breaking', async () => {
      const hospitals = [];
      for (let i = 1; i <= 12; i++) {
        hospitals.push({
          hospitalName: `Hospital ${String.fromCharCode(64 + i)}`, // Hospital A, B, C...
          licenseNumber: `LIC-${i}`,
          phone: `+2519110011${String(i).padStart(2, '0')}`,
          email: `hosp${i}@legash.org`,
          passwordHash: 'dummy',
          location: { coordinates: [38.74, 9.03] },
          verificationStatus: 'approved',
          bloodStock: [{ bloodType: 'A+', availableUnits: i * 10 }]
        });
      }
      await Hospital.insertMany(hospitals);

      const res = await request(app)
        .get('/api/superadmin/analytics/hospitals')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.analytics.approvedHospitalCount).toBe(12);

      const top = res.body.analytics.topHospitals;
      const bottom = res.body.analytics.bottomHospitals;

      expect(top).toHaveLength(10);
      expect(bottom).toHaveLength(10);

      // Top is descending: 120, 110, 100 ...
      expect(top[0].totalUnits).toBe(120);
      expect(top[0].hospitalName).toBe('Hospital L');
      expect(top[9].totalUnits).toBe(30);

      // Bottom is ascending: 10, 20, 30 ...
      expect(bottom[0].totalUnits).toBe(10);
      expect(bottom[0].hospitalName).toBe('Hospital A');
      expect(bottom[9].totalUnits).toBe(100);
    });
  });

  describe('Live stock updates and lifecycle reflection', () => {
    test('updating hospital stock via PUT /api/hospital/blood-stock reflects live on next stock and analytics calls', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Live Test Hospital',
        licenseNumber: 'LIC-LIVE-01',
        phone: '+251911445566',
        email: 'livetest@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        bloodStock: [
          { bloodType: 'A+', availableUnits: 10 },
          { bloodType: 'O+', availableUnits: 5 }
        ]
      });

      const hospitalToken = generateToken({
        id: hospital._id.toString(),
        role: 'hospital'
      });

      // Initial check on stock
      const stockResBefore = await request(app)
        .get('/api/superadmin/hospitals/stock')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(stockResBefore.body.hospitals[0].totalUnits).toBe(15);

      // Initial check on analytics
      const analyticsResBefore = await request(app)
        .get('/api/superadmin/analytics/hospitals')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(analyticsResBefore.body.analytics.national.totalUnits).toBe(15);
      expect(analyticsResBefore.body.analytics.topHospitals[0].totalUnits).toBe(15);

      // Update hospital stock via existing hospital endpoint
      const updateRes = await request(app)
        .put('/api/hospital/blood-stock')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodStock: [
            { bloodType: 'A+', availableUnits: 80 },
            { bloodType: 'O+', availableUnits: 70 }
          ]
        });
      expect(updateRes.statusCode).toBe(200);

      // Call stock endpoint again: immediately shows 150
      const stockResAfter = await request(app)
        .get('/api/superadmin/hospitals/stock')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(stockResAfter.body.hospitals[0].totalUnits).toBe(150);
      expect(stockResAfter.body.hospitals[0].stock['A+']).toBe(80);
      expect(stockResAfter.body.hospitals[0].stock['O+']).toBe(70);

      // Call analytics endpoint again: immediately recalculated
      const analyticsResAfter = await request(app)
        .get('/api/superadmin/analytics/hospitals')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(analyticsResAfter.body.analytics.national.totalUnits).toBe(150);
      expect(analyticsResAfter.body.analytics.topHospitals[0].totalUnits).toBe(150);

      // Now soft-delete this hospital
      hospital.isDeleted = true;
      await hospital.save();

      // Next calls immediately omit the hospital
      const stockResDeleted = await request(app)
        .get('/api/superadmin/hospitals/stock')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(stockResDeleted.body.hospitals).toHaveLength(0);

      const analyticsResDeleted = await request(app)
        .get('/api/superadmin/analytics/hospitals')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(analyticsResDeleted.body.analytics.approvedHospitalCount).toBe(0);
      expect(analyticsResDeleted.body.analytics.national.totalUnits).toBe(0);
    });
  });

  describe('Trends aggregation from HospitalStockSnapshot', () => {
    test('aggregates historical runs: ascending order, latest run of the day, omission of missing days, and 30/90 day windows', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Historical Hospital',
        licenseNumber: 'LIC-HIST-1',
        phone: '+251911998877',
        email: 'hist@legash.org',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        bloodStock: [{ bloodType: 'A+', availableUnits: 50 }]
      });

      const now = new Date();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      const d = now.getUTCDate();

      // Day 1: 10 days ago (within 30 days) - Run 1 at 09:00 UTC (12:00 Addis)
      const day10AgoRun1 = new Date(Date.UTC(y, m, d - 10, 9, 0, 0));
      // Day 1: 10 days ago - Run 2 at 12:00 UTC (15:00 Addis, same day, later run)
      const day10AgoRun2 = new Date(Date.UTC(y, m, d - 10, 12, 0, 0));

      // Day 2: 5 days ago (within 30 days) - Single run at 09:00 UTC
      const day5Ago = new Date(Date.UTC(y, m, d - 5, 9, 0, 0));

      // Day 3: 45 days ago (in last90Days, not last30Days)
      const day45Ago = new Date(Date.UTC(y, m, d - 45, 9, 0, 0));

      // Day 4: 100 days ago (outside both windows)
      const day100Ago = new Date(Date.UTC(y, m, d - 100, 9, 0, 0));

      // Seed Run 1 for 10 days ago (A+ has 10 units)
      await HospitalStockSnapshot.insertMany(
        VALID_BLOOD_TYPES.map((bt) => ({
          hospital: hospital._id,
          bloodType: bt,
          availableUnits: bt === 'A+' ? 10 : 0,
          recordedAt: day10AgoRun1
        }))
      );

      // Seed Run 2 for 10 days ago (A+ has 25 units - this latest run must win, not be summed!)
      await HospitalStockSnapshot.insertMany(
        VALID_BLOOD_TYPES.map((bt) => ({
          hospital: hospital._id,
          bloodType: bt,
          availableUnits: bt === 'A+' ? 25 : 0,
          recordedAt: day10AgoRun2
        }))
      );

      // Seed 5 days ago (A+ has 40 units)
      await HospitalStockSnapshot.insertMany(
        VALID_BLOOD_TYPES.map((bt) => ({
          hospital: hospital._id,
          bloodType: bt,
          availableUnits: bt === 'A+' ? 40 : 0,
          recordedAt: day5Ago
        }))
      );

      // Seed 45 days ago (A+ has 15 units)
      await HospitalStockSnapshot.insertMany(
        VALID_BLOOD_TYPES.map((bt) => ({
          hospital: hospital._id,
          bloodType: bt,
          availableUnits: bt === 'A+' ? 15 : 0,
          recordedAt: day45Ago
        }))
      );

      // Seed 100 days ago (A+ has 99 units - must be omitted)
      await HospitalStockSnapshot.insertMany(
        VALID_BLOOD_TYPES.map((bt) => ({
          hospital: hospital._id,
          bloodType: bt,
          availableUnits: bt === 'A+' ? 99 : 0,
          recordedAt: day100Ago
        }))
      );

      const res = await request(app)
        .get('/api/superadmin/analytics/hospitals')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      const { last30Days, last90Days } = res.body.analytics.trends;

      // last90Days contains 45 days ago, 10 days ago, and 5 days ago (3 points)
      expect(last90Days).toHaveLength(3);

      // Ascending chronological order check
      expect(new Date(last90Days[0].date).getTime()).toBeLessThan(
        new Date(last90Days[1].date).getTime()
      );
      expect(new Date(last90Days[1].date).getTime()).toBeLessThan(
        new Date(last90Days[2].date).getTime()
      );

      // Every point has 8 byBloodType keys
      for (const point of last90Days) {
        expect(Object.keys(point.byBloodType)).toEqual(VALID_BLOOD_TYPES);
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('recordedAt');
        expect(point).toHaveProperty('totalUnits');
      }

      // Check latest run on same day won (day 10 ago had run 1 = 10, run 2 = 25 -> must be 25, not 35)
      const day10Point = last90Days.find((p) => p.recordedAt === day10AgoRun2.toISOString());
      expect(day10Point).toBeDefined();
      expect(day10Point.totalUnits).toBe(25);
      expect(day10Point.byBloodType['A+']).toBe(25);

      // last30Days contains only 10 days ago and 5 days ago (2 points)
      expect(last30Days).toHaveLength(2);
      expect(last30Days.find((p) => p.recordedAt === day45Ago.toISOString())).toBeUndefined();
      expect(last90Days.find((p) => p.recordedAt === day45Ago.toISOString())).toBeDefined();

      // 100 days ago point is in neither
      expect(last90Days.find((p) => p.recordedAt === day100Ago.toISOString())).toBeUndefined();
      expect(last30Days.find((p) => p.recordedAt === day100Ago.toISOString())).toBeUndefined();
    });
  });
});
