// Backend/tests/integration/donorSprint3.test.js
const request = require('supertest');
const app = require('../../server');
const Donor = require('../../src/models/Donor');
const Hospital = require('../../src/models/Hospital');
const BloodRequest = require('../../src/models/BloodRequest');
const BloodRequestResponse = require('../../src/models/BloodRequestResponse');

describe('Sprint 3 Donor Full Lifecycle & Security Contract', () => {
  const donorPhone = '+251911223344';
  const donorFin = 'FIN-99887766';

  it('Executes complete Sprint 3 Donor lifecycle sequentially without mid-flow data wipes', async () => {
    // 1. Register donor without password
    const regRes = await request(app)
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

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);
    expect(regRes.body.donorId).toBeDefined();

    const donorId = regRes.body.donorId;
    const donorDoc = await Donor.findById(donorId);
    expect(donorDoc.phoneVerified).toBe(false);
    expect(donorDoc.pinHash).toBeNull();
    expect(donorDoc.resetCode).toBeDefined();

    // 2. Verify phone OTP
    const verifyRes = await request(app)
      .post('/api/donor/verify-otp')
      .send({
        phone: donorPhone,
        code: donorDoc.resetCode,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);

    const verifiedDonor = await Donor.findById(donorId);
    expect(verifiedDonor.phoneVerified).toBe(true);

    // 3. Set 4-digit PIN & receive device session token
    const pinRes = await request(app)
      .post('/api/donor/set-pin')
      .send({
        phone: donorPhone,
        pin: '1234',
        confirmPin: '1234',
      });

    expect(pinRes.status).toBe(200);
    expect(pinRes.body.success).toBe(true);
    expect(pinRes.body.token).toBeDefined();
    expect(pinRes.body.donor.name).toBe('Aster Abebe');

    const deviceSessionToken = pinRes.body.token;

    // 4. Unlock device with PIN (strictly device-bound by req.user.id)
    const unlockRes = await request(app)
      .post('/api/donor/unlock')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ pin: '1234' });

    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.success).toBe(true);
    expect(unlockRes.body.token).toBeDefined();

    const failUnlock = await request(app)
      .post('/api/donor/unlock')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ pin: '9999' });

    expect(failUnlock.status).toBe(401);
    expect(failUnlock.body.error).toBe('Invalid PIN.');

    // 5. Get Profile
    const profileRes = await request(app)
      .get('/api/donor/profile')
      .set('Authorization', `Bearer ${deviceSessionToken}`);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.profile.name).toBe('Aster Abebe');
    expect(profileRes.body.profile.phone).toBe(donorPhone);
    expect(profileRes.body.profile.fin).toBe(donorFin);
    expect(profileRes.body.profile.gender).toBe('female');
    expect(profileRes.body.profile.bloodType).toBe('unknown');

    // 6. Update Profile - Allows editable fields and REJECTS FIN/gender mutations
    const finMutationFail = await request(app)
      .put('/api/donor/profile')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ fin: 'NEW-FIN-1234' });

    expect(finMutationFail.status).toBe(400);
    expect(finMutationFail.body.error).toContain('immutable');

    const genderMutationFail = await request(app)
      .put('/api/donor/profile')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({ gender: 'male' });

    expect(genderMutationFail.status).toBe(400);
    expect(genderMutationFail.body.error).toContain('immutable');

    const updateRes = await request(app)
      .put('/api/donor/profile')
      .set('Authorization', `Bearer ${deviceSessionToken}`)
      .send({
        bloodType: 'O+',
        weightKg: 65,
        heightCm: 168,
        healthNotes: 'Healthy donor',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.profile.bloodType).toBe('O+');
    expect(updateRes.body.profile.weightKg).toBe(65);

    // 7. Empty blood centers endpoint
    const centersRes = await request(app)
      .get('/api/donor/blood-centers')
      .set('Authorization', `Bearer ${deviceSessionToken}`);

    expect(centersRes.status).toBe(200);
    expect(centersRes.body.centers).toEqual([]);

    /* Commented out for branch #63 (this will be enabled in #64)
    // 8. Respond to request and verify nextSteps payload
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
    */
  });

  it('Proves one donor\'s token can never unlock another\'s account with a shared PIN', async () => {
    // 1. Register and verify Donor A
    const phoneA = '+251911111111';
    const finA = 'FIN-11111111';
    const regResA = await request(app).post('/api/donor/register').send({
      name: 'Donor A',
      phone: phoneA,
      fin: finA,
      gender: 'male',
      bloodType: 'O+',
      location: { lat: 9.0108, lng: 38.7613 },
      agreedToTerms: true,
    });
    const donorDocA = await Donor.findById(regResA.body.donorId);
    await request(app).post('/api/donor/verify-otp').send({ phone: phoneA, code: donorDocA.resetCode });
    const pinResA = await request(app).post('/api/donor/set-pin').send({ phone: phoneA, pin: '5555', confirmPin: '5555' });
    const tokenA = pinResA.body.token;

    // 2. Register and verify Donor B (using the same PIN '5555')
    const phoneB = '+251922222222';
    const finB = 'FIN-22222222';
    const regResB = await request(app).post('/api/donor/register').send({
      name: 'Donor B',
      phone: phoneB,
      fin: finB,
      gender: 'female',
      bloodType: 'A-',
      location: { lat: 9.0108, lng: 38.7613 },
      agreedToTerms: true,
    });
    const donorDocB = await Donor.findById(regResB.body.donorId);
    await request(app).post('/api/donor/verify-otp').send({ phone: phoneB, code: donorDocB.resetCode });
    const pinResB = await request(app).post('/api/donor/set-pin').send({ phone: phoneB, pin: '5555', confirmPin: '5555' });
    const tokenB = pinResB.body.token;

    // 3. Attempting to unlock Donor B's account with Donor A's token should unlock Donor A, not Donor B
    const unlockRes = await request(app)
      .post('/api/donor/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ pin: '5555' });
    
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.donor.id).toBe(regResA.body.donorId);
    expect(unlockRes.body.donor.id).not.toBe(regResB.body.donorId);
  });
});