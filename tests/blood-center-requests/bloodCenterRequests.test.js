// tests/blood-center-requests/bloodCenterRequests.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const Hospital = require('../../src/models/Hospital');
const Admin = require('../../src/models/Admin');
const BloodCenterRequest = require('../../src/models/BloodCenterRequest');
const BloodCenterRequestResponse = require('../../src/models/BloodCenterRequestResponse');
const generateToken = require('../../src/utils/generateToken');
const { hashPassword } = require('../../src/utils/hashPassword');
const { DEFAULT_SEARCH_RADIUS_KM } = require('../../src/utils/constants');

/**
 * Coordinate helper:
 * In Addis Ababa (approx lat 9.0152, lng 38.7512):
 * 1 degree latitude ~= 110.574 km
 * Returns [longitude, latitude] at a given distance in kilometers north of the base.
 */
function getCoordsAtDistance(baseLng, baseLat, distanceKm) {
  const deltaLat = distanceKm / 110.574;
  return [baseLng, baseLat + deltaLat];
}

describe('Feature C2 — Hospital-to-Blood-Center Requests', () => {
  const BASE_LNG = 38.7512;
  const BASE_LAT = 9.0152;

  let hospitalA;
  let hospitalB;
  let hospitalAToken;
  let hospitalBToken;

  let centerInside;
  let centerOutside;
  let centerBoundaryInside;
  let centerBoundaryOutside;
  let centerUnverified;
  let centerIncomplete;
  let centerDeleted;
  let centerNoLocation;

  let centerInsideToken;
  let centerOutsideToken;

  beforeEach(async () => {
    await BloodCenterRequestResponse.deleteMany({});
    await BloodCenterRequest.deleteMany({});
    await Hospital.deleteMany({});
    await Admin.deleteMany({});
    await Admin.createIndexes();

    const passwordHash = await hashPassword('SecurePass123!');

    // 1. Create Hospital A (with valid location)
    hospitalA = await Hospital.create({
      hospitalName: 'St. Paul Millennium Hospital',
      licenseNumber: 'HOSP-STPAUL-001',
      phone: '+251911111111',
      email: 'stpaul@legash.org',
      passwordHash,
      emailVerified: true,
      verificationStatus: 'approved',
      location: {
        type: 'Point',
        coordinates: [BASE_LNG, BASE_LAT],
        address: 'Gulele Subcity, Addis Ababa'
      }
    });
    hospitalAToken = generateToken({ id: hospitalA._id.toString(), role: 'hospital' });

    // 2. Create Hospital B (another hospital for isolation tests)
    hospitalB = await Hospital.create({
      hospitalName: 'Tikur Anbessa Hospital',
      licenseNumber: 'HOSP-TIKUR-002',
      phone: '+251922222222',
      email: 'tikur@legash.org',
      passwordHash,
      emailVerified: true,
      verificationStatus: 'approved',
      location: {
        type: 'Point',
        coordinates: [BASE_LNG + 0.05, BASE_LAT + 0.05],
        address: 'Churchill Road, Addis Ababa'
      }
    });
    hospitalBToken = generateToken({ id: hospitalB._id.toString(), role: 'hospital' });

    // 3. Create Blood Centers:
    // a) Center well inside radius (5 km away)
    centerInside = await Admin.create({
      name: 'Inside Blood Bank',
      centerName: 'Central Blood Bank Inside',
      email: 'inside@center.org',
      phone: '+251933333333',
      passwordHash,
      emailVerified: true,
      termsAccepted: true,
      isDeleted: false,
      location: {
        type: 'Point',
        coordinates: getCoordsAtDistance(BASE_LNG, BASE_LAT, 5),
        address: 'Stadium Area, Addis Ababa'
      }
    });
    centerInsideToken = generateToken({ id: centerInside._id.toString(), role: 'admin' });

    // b) Center well outside radius (DEFAULT_SEARCH_RADIUS_KM + 15 km away)
    centerOutside = await Admin.create({
      name: 'Outside Blood Bank',
      centerName: 'Far Blood Bank Outside',
      email: 'outside@center.org',
      phone: '+251944444444',
      passwordHash,
      emailVerified: true,
      termsAccepted: true,
      isDeleted: false,
      location: {
        type: 'Point',
        coordinates: getCoordsAtDistance(BASE_LNG, BASE_LAT, DEFAULT_SEARCH_RADIUS_KM + 15),
        address: 'Bishoftu Regional Hub'
      }
    });
    centerOutsideToken = generateToken({ id: centerOutside._id.toString(), role: 'admin' });

    // c) Boundary Inside: placed at (DEFAULT_SEARCH_RADIUS_KM - 0.5) km
    centerBoundaryInside = await Admin.create({
      name: 'Boundary Inside Center',
      centerName: 'Boundary Inside Center',
      email: 'boundary.inside@center.org',
      phone: '+251955555555',
      passwordHash,
      emailVerified: true,
      termsAccepted: true,
      isDeleted: false,
      location: {
        type: 'Point',
        coordinates: getCoordsAtDistance(BASE_LNG, BASE_LAT, DEFAULT_SEARCH_RADIUS_KM - 0.5),
        address: 'Outer Ring Road, Addis Ababa'
      }
    });

    // d) Boundary Outside: placed at (DEFAULT_SEARCH_RADIUS_KM + 1.0) km
    centerBoundaryOutside = await Admin.create({
      name: 'Boundary Outside Center',
      centerName: 'Boundary Outside Center',
      email: 'boundary.outside@center.org',
      phone: '+251966666666',
      passwordHash,
      emailVerified: true,
      termsAccepted: true,
      isDeleted: false,
      location: {
        type: 'Point',
        coordinates: getCoordsAtDistance(BASE_LNG, BASE_LAT, DEFAULT_SEARCH_RADIUS_KM + 1.0),
        address: 'Beyond Border Hub'
      }
    });

    // e) Center with unverified email (must be excluded)
    centerUnverified = await Admin.create({
      name: 'Unverified Blood Bank',
      centerName: 'Unverified Blood Bank',
      email: 'unverified@center.org',
      phone: '+251977777777',
      passwordHash,
      emailVerified: false,
      termsAccepted: true,
      isDeleted: false,
      location: {
        type: 'Point',
        coordinates: getCoordsAtDistance(BASE_LNG, BASE_LAT, 2),
        address: 'Nearby Hub'
      }
    });

    // f) Center with incomplete setup / no passwordHash (must be excluded)
    centerIncomplete = await Admin.create({
      name: 'Pending Setup Blood Bank',
      email: 'pending@center.org',
      phone: '+251988888888',
      passwordHash: null,
      emailVerified: true,
      isDeleted: false,
      location: {
        type: 'Point',
        coordinates: getCoordsAtDistance(BASE_LNG, BASE_LAT, 2),
        address: 'Nearby Pending Hub'
      }
    });

    // g) Soft-deleted center (must be excluded)
    centerDeleted = await Admin.create({
      name: 'Deleted Blood Bank',
      centerName: 'Deleted Blood Bank',
      email: 'deleted@center.org',
      phone: '+251999999999',
      passwordHash,
      emailVerified: true,
      termsAccepted: true,
      isDeleted: true,
      location: {
        type: 'Point',
        coordinates: getCoordsAtDistance(BASE_LNG, BASE_LAT, 2),
        address: 'Nearby Deleted Hub'
      }
    });

    // h) Center without location coordinates (must be excluded)
    centerNoLocation = await Admin.create({
      name: 'No Location Center',
      centerName: 'No Location Center',
      email: 'nolocation@center.org',
      phone: '+251910101010',
      passwordHash,
      emailVerified: true,
      termsAccepted: true,
      isDeleted: false
    });
  });

  describe('1. Radius Matching and Creation (Hospital POST /api/hospital/blood-center-requests)', () => {
    it('creates request and matches only eligible centers within DEFAULT_SEARCH_RADIUS_KM', async () => {
      const futureDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const res = await request(app)
        .post('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`)
        .send({
          bloodType: 'A+',
          quantityNeeded: 5,
          note: 'Urgent surgery preparation',
          closesAt: futureDate
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.request).toBeDefined();
      expect(res.body.request.bloodType).toBe('A+');
      expect(res.body.request.quantityNeeded).toBe(5);
      expect(res.body.request.note).toBe('Urgent surgery preparation');
      expect(res.body.request.status).toBe('open');

      // Matching assertion:
      // Eligible centers within radius: centerInside (5 km), centerBoundaryInside (14.5 km) = 2 centers.
      // Excluded: centerOutside, centerBoundaryOutside, centerUnverified, centerIncomplete, centerDeleted, centerNoLocation.
      expect(res.body.matchedCenterCount).toBe(2);

      // Verify DB records
      const responses = await BloodCenterRequestResponse.find({ request: res.body.request.id });
      expect(responses).toHaveLength(2);
      const matchedCenterIds = responses.map((r) => r.bloodCenter.toString());
      expect(matchedCenterIds).toContain(centerInside._id.toString());
      expect(matchedCenterIds).toContain(centerBoundaryInside._id.toString());
      expect(matchedCenterIds).not.toContain(centerOutside._id.toString());
      expect(matchedCenterIds).not.toContain(centerBoundaryOutside._id.toString());
      expect(matchedCenterIds).not.toContain(centerUnverified._id.toString());
      expect(matchedCenterIds).not.toContain(centerIncomplete._id.toString());
      expect(matchedCenterIds).not.toContain(centerDeleted._id.toString());
      expect(matchedCenterIds).not.toContain(centerNoLocation._id.toString());

      // Initial response status must be 'pending'
      expect(responses.every((r) => r.status === 'pending')).toBe(true);
    });

    it('returns 201 with truthful 0 matches when no centers are within radius', async () => {
      // Temporarily remove all eligible centers
      await Admin.deleteMany({});

      const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const res = await request(app)
        .post('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`)
        .send({
          bloodType: 'O-',
          quantityNeeded: 2,
          closesAt: futureDate
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.matchedCenterCount).toBe(0);
      expect(res.body.message).toMatch(/No nearby blood centers found/i);

      // Verify request is saved
      const saved = await BloodCenterRequest.findById(res.body.request.id);
      expect(saved).toBeDefined();
      expect(saved.quantityNeeded).toBe(2);

      // Verify no response rows created
      const count = await BloodCenterRequestResponse.countDocuments({ request: saved._id });
      expect(count).toBe(0);
    });

    it('rejects creation if hospital has no location or invalid coordinates', async () => {
      // Unset location in database directly to simulate a hospital record without location
      await Hospital.updateOne({ _id: hospitalA._id }, { $unset: { location: '' } });

      const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const res = await request(app)
        .post('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`)
        .send({
          bloodType: 'B+',
          quantityNeeded: 3,
          closesAt: futureDate
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Hospital location is invalid or missing/i);
    });

    it('validates bloodType enum', async () => {
      const res = await request(app)
        .post('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`)
        .send({
          bloodType: 'C+',
          quantityNeeded: 1,
          closesAt: new Date(Date.now() + 3600 * 1000).toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid blood type.');
    });

    it('validates quantityNeeded is a positive integer', async () => {
      const cases = [0, -1, 2.5, 'three', null];
      for (const val of cases) {
        const res = await request(app)
          .post('/api/hospital/blood-center-requests')
          .set('Authorization', `Bearer ${hospitalAToken}`)
          .send({
            bloodType: 'A+',
            quantityNeeded: val,
            closesAt: new Date(Date.now() + 3600 * 1000).toISOString()
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('quantityNeeded must be a positive integer.');
      }
    });

    it('rejects past or missing closesAt timestamp', async () => {
      // Past timestamp
      const pastRes = await request(app)
        .post('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`)
        .send({
          bloodType: 'A+',
          quantityNeeded: 2,
          closesAt: new Date(Date.now() - 3600 * 1000).toISOString()
        });
      expect(pastRes.status).toBe(400);
      expect(pastRes.body.error).toBe('closesAt must be a valid future timestamp.');

      // Missing closesAt
      const missingRes = await request(app)
        .post('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`)
        .send({
          bloodType: 'A+',
          quantityNeeded: 2
        });
      expect(missingRes.status).toBe(400);
      expect(missingRes.body.error).toBe('closesAt must be a valid future timestamp.');
    });

    it('rejects note exceeding 500 characters', async () => {
      const res = await request(app)
        .post('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`)
        .send({
          bloodType: 'A+',
          quantityNeeded: 1,
          note: 'a'.repeat(501),
          closesAt: new Date(Date.now() + 3600 * 1000).toISOString()
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Note cannot exceed 500 characters.');
    });

    it('cleans up request document if response insertion fails (failure strategy)', async () => {
      jest.spyOn(BloodCenterRequestResponse, 'insertMany').mockImplementationOnce(() => {
        throw new Error('Simulated DB network failure');
      });

      const res = await request(app)
        .post('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`)
        .send({
          bloodType: 'A+',
          quantityNeeded: 1,
          closesAt: new Date(Date.now() + 3600 * 1000).toISOString()
        });

      expect(res.status).toBe(500);

      // Verify no orphaned request was left behind in the database
      const count = await BloodCenterRequest.countDocuments({});
      expect(count).toBe(0);

      BloodCenterRequestResponse.insertMany.mockRestore();
    });
  });

  describe('2. Hospital List Requests (GET /api/hospital/blood-center-requests)', () => {
    it('lists only requests belonging to the authenticated hospital with response summaries', async () => {
      // Create request for Hospital A
      const reqA = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'AB+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: reqA._id,
        bloodCenter: centerInside._id,
        status: 'accepted',
        respondedAt: new Date()
      });
      await BloodCenterRequestResponse.create({
        request: reqA._id,
        bloodCenter: centerBoundaryInside._id,
        status: 'denied',
        respondedAt: new Date()
      });

      // Create request for Hospital B (must NOT be returned to Hospital A)
      await BloodCenterRequest.create({
        hospital: hospitalB._id,
        bloodType: 'O-',
        quantityNeeded: 10,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });

      const res = await request(app)
        .get('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.requests).toHaveLength(1);
      expect(res.body.requests[0].id).toBe(reqA._id.toString());
      expect(res.body.requests[0].bloodType).toBe('AB+');
      expect(res.body.requests[0].matchedCenterCount).toBe(2);
      expect(res.body.requests[0].acceptedCount).toBe(1);
      expect(res.body.requests[0].deniedCount).toBe(1);
      expect(res.body.requests[0].pendingCount).toBe(0);

      // Verify NO center phone or email leaked in list view
      expect(JSON.stringify(res.body)).not.toContain(centerInside.phone);
      expect(JSON.stringify(res.body)).not.toContain(centerInside.email);
    });

    it('auto-marks expired requests as closed at read time', async () => {
      // Create request that already passed closesAt
      const pastReq = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 1,
        closesAt: new Date(Date.now() - 10000), // 10s ago
        status: 'open'
      });

      const res = await request(app)
        .get('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.requests[0].status).toBe('closed');
      expect(res.body.requests[0].closedReason).toBe('expired');

      // Verify persisted in DB
      const dbReq = await BloodCenterRequest.findById(pastReq._id);
      expect(dbReq.status).toBe('closed');
      expect(dbReq.closedReason).toBe('expired');
    });
  });

  describe('3. Hospital Get Accepted Centers (GET /api/hospital/blood-center-requests/:requestId/accepted-centers)', () => {
    it('returns contact details only for centers that accepted the request', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'A+',
        quantityNeeded: 3,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });

      // Center Inside: accepted
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'accepted',
        respondedAt: new Date()
      });

      // Center Boundary Inside: denied
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerBoundaryInside._id,
        status: 'denied',
        respondedAt: new Date()
      });

      const res = await request(app)
        .get(`/api/hospital/blood-center-requests/${reqDoc._id}/accepted-centers`)
        .set('Authorization', `Bearer ${hospitalAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.acceptedCenters).toHaveLength(1);

      const accepted = res.body.acceptedCenters[0];
      expect(accepted.id).toBe(centerInside._id.toString());
      expect(accepted.centerName).toBe(centerInside.centerName);
      expect(accepted.phone).toBe(centerInside.phone);
      expect(accepted.email).toBe(centerInside.email);
      expect(accepted.address).toBe(centerInside.location.address);

      // Denied center contacts must remain hidden
      expect(JSON.stringify(res.body)).not.toContain(centerBoundaryInside.phone);
      expect(JSON.stringify(res.body)).not.toContain(centerBoundaryInside.email);

      // Sensitive fields must NEVER be leaked
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      expect(JSON.stringify(res.body)).not.toContain('setupToken');
      expect(JSON.stringify(res.body)).not.toContain('verificationOtp');
    });

    it('prevents Hospital B from accessing accepted centers for Hospital A request', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'A+',
        quantityNeeded: 3,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });

      const res = await request(app)
        .get(`/api/hospital/blood-center-requests/${reqDoc._id}/accepted-centers`)
        .set('Authorization', `Bearer ${hospitalBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('You do not have permission to view this request.');
    });

    it('returns 400 for invalid ObjectId and 404 for non-existent request', async () => {
      const invalidRes = await request(app)
        .get('/api/hospital/blood-center-requests/invalid-id/accepted-centers')
        .set('Authorization', `Bearer ${hospitalAToken}`);
      expect(invalidRes.status).toBe(400);

      const fakeId = new mongoose.Types.ObjectId();
      const notFoundRes = await request(app)
        .get(`/api/hospital/blood-center-requests/${fakeId}/accepted-centers`)
        .set('Authorization', `Bearer ${hospitalAToken}`);
      expect(notFoundRes.status).toBe(404);
    });
  });

  describe('4. Hospital Close Request (PATCH /api/hospital/blood-center-requests/:requestId/close)', () => {
    it('closes an open request and preserves historical response rows', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'B-',
        quantityNeeded: 2,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      const res = await request(app)
        .patch(`/api/hospital/blood-center-requests/${reqDoc._id}/close`)
        .set('Authorization', `Bearer ${hospitalAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.request.status).toBe('closed');
      expect(res.body.request.closedReason).toBe('manual');

      // Verify response history preserved
      const responses = await BloodCenterRequestResponse.find({ request: reqDoc._id });
      expect(responses).toHaveLength(1);
    });

    it('is safe and idempotent when repeated on an already closed request', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'B-',
        quantityNeeded: 2,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'closed',
        closedReason: 'manual',
        closedAt: new Date()
      });

      const res = await request(app)
        .patch(`/api/hospital/blood-center-requests/${reqDoc._id}/close`)
        .set('Authorization', `Bearer ${hospitalAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Request is already closed.');
    });

    it('prevents Hospital B from closing Hospital A request', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'B-',
        quantityNeeded: 2,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });

      const res = await request(app)
        .patch(`/api/hospital/blood-center-requests/${reqDoc._id}/close`)
        .set('Authorization', `Bearer ${hospitalBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You do not have permission to close this request.');
    });
  });

  describe('5. Blood Center List Incoming Requests (GET /api/admin/blood-center-requests)', () => {
    it('returns only open, non-expired requests assigned to the center', async () => {
      // Request 1: assigned to Center Inside (Open & Future)
      const req1 = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'A+',
        quantityNeeded: 2,
        note: 'Emergency ICU',
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: req1._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      // Request 2: assigned to Center Inside but already CLOSED
      const req2 = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 1,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'closed'
      });
      await BloodCenterRequestResponse.create({
        request: req2._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      // Request 3: assigned only to Center Boundary Inside (Center Inside must not see it)
      const req3 = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'B+',
        quantityNeeded: 3,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: req3._id,
        bloodCenter: centerBoundaryInside._id,
        status: 'pending'
      });

      const res = await request(app)
        .get('/api/admin/blood-center-requests')
        .set('Authorization', `Bearer ${centerInsideToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.requests).toHaveLength(1);
      expect(res.body.requests[0].requestId).toBe(req1._id.toString());
      expect(res.body.requests[0].bloodType).toBe('A+');
      expect(res.body.requests[0].quantityNeeded).toBe(2);
      expect(res.body.requests[0].note).toBe('Emergency ICU');
      expect(res.body.requests[0].responseStatus).toBe('pending');

      // Privacy: no hospital private license number or credentials
      expect(JSON.stringify(res.body)).not.toContain(hospitalA.licenseNumber);
    });

    it('excludes expired requests dynamically at read time', async () => {
      const expiredReq = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'A+',
        quantityNeeded: 2,
        closesAt: new Date(Date.now() - 5000), // 5 seconds ago
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: expiredReq._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      const res = await request(app)
        .get('/api/admin/blood-center-requests')
        .set('Authorization', `Bearer ${centerInsideToken}`);

      expect(res.status).toBe(200);
      expect(res.body.requests).toHaveLength(0);
    });
  });

  describe('6. Blood Center Respond (PATCH /api/admin/blood-center-requests/:requestId/respond)', () => {
    it('accepts pending request and records response timestamp', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      const res = await request(app)
        .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
        .set('Authorization', `Bearer ${centerInsideToken}`)
        .send({ status: 'accepted' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.response.status).toBe('accepted');
      expect(res.body.response.respondedAt).toBeDefined();

      const dbResp = await BloodCenterRequestResponse.findOne({
        request: reqDoc._id,
        bloodCenter: centerInside._id
      });
      expect(dbResp.status).toBe('accepted');
    });

    it('denies pending request and records response timestamp', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      const res = await request(app)
        .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
        .set('Authorization', `Bearer ${centerInsideToken}`)
        .send({ status: 'denied' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.response.status).toBe('denied');
    });

    it('rejects a second response after acceptance with 409 Conflict', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'accepted',
        respondedAt: new Date()
      });

      const res = await request(app)
        .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
        .set('Authorization', `Bearer ${centerInsideToken}`)
        .send({ status: 'denied' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('You have already responded to this request.');
    });

    it('rejects responses to closed requests with 409 Conflict', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'closed',
        closedReason: 'manual'
      });
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      const res = await request(app)
        .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
        .set('Authorization', `Bearer ${centerInsideToken}`)
        .send({ status: 'accepted' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('This request is closed or has expired.');
    });

    it('rejects responses to expired requests with 409 Conflict', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() - 10000), // expired 10s ago
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      const res = await request(app)
        .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
        .set('Authorization', `Bearer ${centerInsideToken}`)
        .send({ status: 'accepted' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('This request is closed or has expired.');
    });

    it('prevents center from responding to a request not assigned to it (403)', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      // Response assigned ONLY to Center Inside
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      // Center Outside attempts to respond
      const res = await request(app)
        .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
        .set('Authorization', `Bearer ${centerOutsideToken}`)
        .send({ status: 'accepted' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You are not authorized to respond to this request.');
    });

    it('handles concurrent responses safely (only one succeeds, second gets 409)', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });
      await BloodCenterRequestResponse.create({
        request: reqDoc._id,
        bloodCenter: centerInside._id,
        status: 'pending'
      });

      // Simulate simultaneous requests
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
          .set('Authorization', `Bearer ${centerInsideToken}`)
          .send({ status: 'accepted' }),
        request(app)
          .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
          .set('Authorization', `Bearer ${centerInsideToken}`)
          .send({ status: 'denied' })
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);
    });

    it('rejects invalid status values with 400 Bad Request', async () => {
      const reqDoc = await BloodCenterRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 4,
        closesAt: new Date(Date.now() + 3600 * 1000),
        status: 'open'
      });

      const res = await request(app)
        .patch(`/api/admin/blood-center-requests/${reqDoc._id}/respond`)
        .set('Authorization', `Bearer ${centerInsideToken}`)
        .send({ status: 'maybe' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Status must be either accepted or denied.');
    });
  });

  describe('7. Role-Based Access and Unauthenticated Guards', () => {
    it('rejects unauthenticated calls with 401', async () => {
      const res = await request(app).get('/api/hospital/blood-center-requests');
      expect(res.status).toBe(401);

      const adminRes = await request(app).get('/api/admin/blood-center-requests');
      expect(adminRes.status).toBe(401);
    });

    it('rejects hospital token on blood center endpoints with 403', async () => {
      const res = await request(app)
        .get('/api/admin/blood-center-requests')
        .set('Authorization', `Bearer ${hospitalAToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects admin token on hospital endpoints with 403', async () => {
      const res = await request(app)
        .get('/api/hospital/blood-center-requests')
        .set('Authorization', `Bearer ${centerInsideToken}`);

      expect(res.status).toBe(403);
    });
  });
});
