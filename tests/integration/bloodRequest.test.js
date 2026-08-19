const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const bloodRequestRoutes = require('../../src/routes/bloodRequestRoutes');
const BloodRequest = require('../../src/models/BloodRequest');
const BloodRequestResponse = require('../../src/models/BloodRequestResponse');
const Hospital = require('../../src/models/Hospital');
const Donor = require('../../src/models/Donor');
const generateToken = require('../../src/utils/generateToken');

// Setup a small Express app for testing
const app = express();
app.use(express.json());
app.use('/api/hospital/blood-requests', bloodRequestRoutes);

// Error handler
const errorHandler = require('../../src/middleware/errorHandler');
app.use(errorHandler);

jest.mock('../../src/services/pushService', () => ({
  sendBloodAlert: jest.fn().mockResolvedValue(true)
}));
jest.mock('../../src/services/smsService', () => ({
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  sendBloodAlertSms: jest.fn().mockResolvedValue(true)
}));

describe('Blood Request Lifecycle Integration', () => {
  let hospital, donor1, donor2, hospitalToken, donor1Token;

  beforeEach(async () => {
    await Hospital.deleteMany({});
    await Donor.deleteMany({});
    await BloodRequest.deleteMany({});
    await BloodRequestResponse.deleteMany({});
    
    // Ensure 2dsphere index is built before running $near queries
    await Donor.createIndexes();

    hospital = await Hospital.create({
      hospitalName: 'Test Hospital',
      licenseNumber: 'TEST-123',
      phone: '+251900000001',
      email: 'test@hospital.com',
      passwordHash: 'hashed',
      location: { type: 'Point', coordinates: [38.7578, 9.0320] },
      agreedToTerms: true,
      emailVerified: true,
      verificationStatus: 'approved'
    });

    hospitalToken = generateToken({ id: hospital._id, role: 'hospital' });

    // Donor 1: Nearby, matching
    donor1 = await Donor.create({
      name: 'John Doe',
      phone: '+251900000002',
      fin: 'FIN123',
      gender: 'male',
      bloodType: 'O+',
      location: { type: 'Point', coordinates: [38.7579, 9.0321] },
      agreedToTerms: true,
      phoneVerified: true,
      passwordHash: 'hashed'
    });
    donor1Token = generateToken({ id: donor1._id, role: 'donor' });

    // Donor 2: Not matching type
    donor2 = await Donor.create({
      name: 'Jane Doe',
      phone: '+251900000003',
      fin: 'FIN124',
      gender: 'female',
      bloodType: 'A+',
      location: { type: 'Point', coordinates: [38.7580, 9.0322] },
      agreedToTerms: true,
      phoneVerified: true,
      passwordHash: 'hashed'
    });
  });

  it('runs the full blood request lifecycle: create -> list -> respond -> close', async () => {
    // 1. Create a blood request and notifies matched donors
    let res = await request(app)
      .post('/api/hospital/blood-requests')
      .set('Authorization', `Bearer ${hospitalToken}`)
      .send({
        bloodType: 'O+',
        quantityNeeded: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.notifiedDonorCount).toBe(1);

    const requestId = res.body.requestId;

    const requestDoc = await BloodRequest.findById(requestId);
    expect(requestDoc).not.toBeNull();
    expect(requestDoc.bloodType).toBe('O+');
    
    const responses = await BloodRequestResponse.find({ bloodRequest: requestId });
    expect(responses.length).toBe(1);
    expect(responses[0].donor.toString()).toBe(donor1._id.toString());
    
    const responseId = responses[0]._id;

    // 2. Lists requests with correct counts
    res = await request(app)
      .get('/api/hospital/blood-requests')
      .set('Authorization', `Bearer ${hospitalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBe(1);
    expect(res.body.requests[0].pendingCount).toBe(1);
    expect(res.body.requests[0].acceptedCount).toBe(0);

    // 3. Donor responds via direct model update (testing hospital getResponses side)
    await BloodRequestResponse.findByIdAndUpdate(responseId, {
      status: 'accepted',
      respondedAt: new Date()
    });

    res = await request(app)
      .get(`/api/hospital/blood-requests/${requestId}/responses`)
      .set('Authorization', `Bearer ${hospitalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pendingCount).toBe(0);
    expect(res.body.accepted.length).toBe(1);
    expect(res.body.accepted[0].name).toBe('John Doe');
    expect(res.body.accepted[0].phone).toBe('+251900000002');

    // 4. Closes a request
    res = await request(app)
      .patch(`/api/hospital/blood-requests/${requestId}/close`)
      .set('Authorization', `Bearer ${hospitalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const closedRequest = await BloodRequest.findById(requestId);
    expect(closedRequest.status).toBe('closed');
    expect(closedRequest.closedReason).toBe('manual');

    // 5. Fails to double close
    res = await request(app)
      .patch(`/api/hospital/blood-requests/${requestId}/close`)
      .set('Authorization', `Bearer ${hospitalToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This request is already closed.');
  });

  describe('Validation and Authorization (400/403)', () => {
    it('returns 403 Forbidden when a Donor tries to access hospital routes', async () => {
      // POST /
      let res = await request(app)
        .post('/api/hospital/blood-requests')
        .set('Authorization', `Bearer ${donor1Token}`)
        .send({ bloodType: 'O+', quantityNeeded: 2 });
      expect(res.status).toBe(403);

      // GET /
      res = await request(app)
        .get('/api/hospital/blood-requests')
        .set('Authorization', `Bearer ${donor1Token}`);
      expect(res.status).toBe(403);

      // GET /:id/responses
      res = await request(app)
        .get('/api/hospital/blood-requests/some-fake-id/responses')
        .set('Authorization', `Bearer ${donor1Token}`);
      expect(res.status).toBe(403);

      // PATCH /:id/close
      res = await request(app)
        .patch('/api/hospital/blood-requests/some-fake-id/close')
        .set('Authorization', `Bearer ${donor1Token}`);
      expect(res.status).toBe(403);
    });

    it('returns 400 when invalid bloodType or quantityNeeded is provided', async () => {
      // Invalid bloodType
      let res = await request(app)
        .post('/api/hospital/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodType: 'invalid', quantityNeeded: 2 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid blood type/);

      // Negative quantityNeeded
      res = await request(app)
        .post('/api/hospital/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodType: 'O+', quantityNeeded: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantityNeeded must be a positive integer/);
      
      // Zero quantityNeeded
      res = await request(app)
        .post('/api/hospital/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ bloodType: 'O+', quantityNeeded: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/quantityNeeded must be a positive integer/);
    });
  });
});