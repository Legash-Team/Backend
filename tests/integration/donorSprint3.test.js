// Backend/tests/integration/donorSprint3.test.js
const request = require('supertest');
const app = require('../../server');
const Donor = require('../../models/Donor');
const Hospital = require('../../models/Hospital');
const BloodRequest = require('../../models/BloodRequest');
const BloodRequestResponse = require('../../models/BloodRequestResponse');

describe('Sprint 3 Donor Full Lifecycle & Security Contract', () => {
  const donorPhone = '+251911223344';
  const donorFin = 'FIN-99887766';
  let deviceSessionToken = '';
  let donorId = '';

  it('Step 1: Register donor without password and receives 201', async () => {
    const res = await request(app)
      .post('/api/donor/register')
      .send({
        name: 'Aster Abebe',
        phone: donorPhone,
        fin: donorFin,
        gender: 'female',
        bloodType: 'unknown',
        location: { lat: 9.0108, lng: 38.7613 },
        agreedToTerms: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.donorId).toBeDefined();

    donorId = res.body.donorId;
    const donorDoc = await Donor.findById(donorId);
    expect(donorDoc.phoneVerified).toBe(false);
    expect(donorDoc.pinHash).toBeNull();
    expect(donorDoc.passwordHash).toBeUndefined();
    expect(donorDoc.resetCode).toBeDefined();
  });

  it('Step 2: Verify phone OTP', async () => {
    const donorDoc = await Donor.findOne({ phone: donorPhone });
    const res = await request(app)
      .post('/api/donor/verify-otp')
      .send({
        phone: donorPhone,
        code: donorDoc.resetCode,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Donor.findOne({ phone: donorPhone });
    expect(updated.phoneVerified).toBe(true);
  });

  it('Step 3: Set 4-digit PIN and receive device session token', async () => {
    const res = await request(app)
      .post('/api/donor/set-pin')
      .send({
        phone: donorPhone,
        pin: '1234',
        confirmPin: '1234',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.donor.name).toBe('Aster Abebe');

    deviceSessionToken = res.body.token;
  });

  it('Step 4: Unlock device with PIN (strictly device-bound by req.user.id)', async () => {
    // 1. Valid unlock on authenticated device session
    const res = await request(app)
      .post('/api/donor/unlock')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();

    // 2. Reject incorrect PIN
    const failRes = await request(app)
      .post('/api/donor/unlock')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ pin: '9999' });

    expect(failRes.status).toBe(401);
    expect(failRes.body.error).toBe('Invalid PIN.');
  });

  it('Step 5: Get Profile and verify fields are directly visible', async () => {
    const res = await request(app)
      .get('/api/donor/profile')
      .set('Authorization', `Bearer ${deviceSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile.name).toBe('Aster Abebe');
    expect(res.body.profile.phone).toBe(donorPhone);
    expect(res.body.profile.fin).toBe(donorFin);
    expect(res.body.profile.gender).toBe('female');
    expect(res.body.profile.bloodType).toBe('unknown');
  });

  it('Step 6: Update Profile - Allows editable fields and REJECTS FIN/gender mutations', async () => {
    // 1. Mutating immutable fields FIN and gender must be rejected
    const immutableAttempt = await request(app)
      .put('/api/donor/profile')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ fin: 'NEW-FIN-1234' });

    expect(immutableAttempt.status).toBe(400);
    expect(immutableAttempt.body.error).toContain('immutable');

    const genderAttempt = await request(app)
      .put('/api/donor/profile')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ gender: 'male' });

    expect(genderAttempt.status).toBe(400);
    expect(genderAttempt.body.error).toContain('immutable');

    // 2. Updating editable fields succeeds
    const updateRes = await request(app)
      .put('/api/donor/profile')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({
        bloodType: 'O+',
        weightKg: 65,
        heightCm: 168,
        healthNotes: 'Healthy and active donor',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.profile.bloodType).toBe('O+');
    expect(updateRes.body.profile.weightKg).toBe(65);
    expect(updateRes.body.profile.fin).toBe(donorFin);
  });

  it('Step 7: Empty blood centers endpoint returns { success: true, centers: [] }', async () => {
    const res = await request(app)
      .get('/api/donor/blood-centers')
      .set('Authorization', `Bearer ${deviceSessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.centers).toEqual([]);
  });

  it('Step 8: Request acceptance returns nextSteps payload for mobile popup', async () => {
    const hospital = await Hospital.create({
      hospitalName: 'St. Paul Hospital',
      licenseNumber: 'LIC-TEST-001',
      phone: '+251911999999',
      email: 'stpaul@example.com',
      passwordHash: 'hashed_password',
      location: { type: 'Point', coordinates: [38.7613, 9.0108] },
      emailVerified: true,
      verificationStatus: 'approved',
    });

    const bloodReq = await BloodRequest.create({
      hospital: hospital._id,
      bloodType: 'O+',
      quantityNeeded: 2,
      isEmergency: true,
      description: 'Urgent surgery',
      closesAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });

    const notification = await BloodRequestResponse.create({
      bloodRequest: bloodReq._id,
      donor: donorId,
      status: 'pending',
    });

    const respondRes = await request(app)
      .post(`/api/donor/notifications/${notification._id}/respond`)
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ response: 'accepted' });

    expect(respondRes.status).toBe(200);
    expect(respondRes.body.success).toBe(true);
    expect(respondRes.body.nextSteps).toBeDefined();
    expect(respondRes.body.nextSteps.hospitalName).toBe('St. Paul Hospital');
    expect(respondRes.body.nextSteps.hospitalPhone).toBe('+251911999999');
    expect(respondRes.body.nextSteps.hospitalLocation.lat).toBe(9.0108);
    expect(respondRes.body.nextSteps.hospitalLocation.lng).toBe(38.7613);
  });
});