const request = require('supertest');
const express = require('express');
const donorAuthRoutes = require('../../src/routes/donorAuthRoutes');
const Donor = require('../../src/models/Donor');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let app;
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/donor', donorAuthRoutes);
  app.use('/v1/donor', donorAuthRoutes);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Donor.deleteMany({});
});

describe('POST /v1/donor/resend-otp', () => {
  it('should return 200 when unverified donor requests a resend', async () => {
    await Donor.create({
      name: 'Yared Tadesse',
      phone: '+251911234567',
      fin: 'ETH-8829-1029-4401',
      passwordHash: 'hashedpass',
      gender: 'male',
      phoneVerified: false,
      location: { type: 'Point', coordinates: [38.75, 9.03] },
      agreedToTerms: true
    });

    const res = await request(app)
      .post('/v1/donor/resend-otp')
      .send({ phone: '+251911234567' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('OTP');
  });

  it('should return 400 when phone number is already verified', async () => {
    await Donor.create({
      name: 'Yared Tadesse',
      phone: '+251911234567',
      fin: 'ETH-8829-1029-4401',
      passwordHash: 'hashedpass',
      gender: 'male',
      phoneVerified: true,
      location: { type: 'Point', coordinates: [38.75, 9.03] },
      agreedToTerms: true
    });

    const res = await request(app)
      .post('/v1/donor/resend-otp')
      .send({ phone: '+251911234567' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Phone number is already verified.');
  });
});