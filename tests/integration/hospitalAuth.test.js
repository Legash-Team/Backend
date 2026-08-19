const request = require('supertest');
const express = require('express');
const hospitalAuthRoutes = require('../../src/routes/hospitalAuthRoutes');
const donorAuthRoutes = require('../../src/routes/donorAuthRoutes');
const Hospital = require('../../src/models/Hospital');
const Donor = require('../../src/models/Donor');

// Mock SMS Service for tests
jest.mock('../../src/services/smsService', () => ({
  sendOtp: jest.fn().mockResolvedValue(true),
  verifyOtp: jest.fn().mockResolvedValue(true),
}));

let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/hospital', hospitalAuthRoutes);
  app.use('/api/hospitals', hospitalAuthRoutes);
  app.use('/v1/donor', donorAuthRoutes);
  app.use('/api/donor', donorAuthRoutes);
});

beforeEach(async () => {
  await Hospital.deleteMany({});
  await Donor.deleteMany({});
  jest.clearAllMocks();
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
      agreedToTerms: true,
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
      agreedToTerms: true,
    });

    const res = await request(app)
      .post('/v1/donor/resend-otp')
      .send({ phone: '+251911234567' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Phone number is already verified.');
  });
});