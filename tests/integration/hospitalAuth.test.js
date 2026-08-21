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

describe('Hospital Registration, OTP Email Verification & Resend Flow', () => {
  const validHospitalPayload = {
    hospitalName: 'Tikur Anbessa Hospital',
    email: 'tikur.anbessa@legash.org',
    password: 'Password123!',
    phone: '+251911888777',
    licenseNumber: 'LIC-TIKUR-001',
    location: {
      lat: 9.0108,
      lng: 38.7613,
      address: 'Addis Ababa, Ethiopia',
    },
    agreedToTerms: true,
  };

  it('POST /api/hospital/register creates hospital with pending status and 6-digit OTP', async () => {
    const res = await request(app)
      .post('/api/hospital/register')
      .send(validHospitalPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.hospitalId).toBeDefined();

    const hospital = await Hospital.findById(res.body.hospitalId);
    expect(hospital.emailVerified).toBe(false);
    expect(hospital.verificationStatus).toBe('pending');
    expect(hospital.verificationOtp).toMatch(/^\d{6}$/);
    expect(hospital.verificationOtpExpiresAt).toBeDefined();
  });

  it('POST /api/hospital/verify-email sets emailVerified=true but KEEPS verificationStatus="pending" (Super Admin gate preserved)', async () => {
    const regRes = await request(app)
      .post('/api/hospital/register')
      .send(validHospitalPayload);

    const hospitalBefore = await Hospital.findById(regRes.body.hospitalId);
    const otpCode = hospitalBefore.verificationOtp;

    // Verify email with OTP code
    const verifyRes = await request(app)
      .post('/api/hospital/verify-email')
      .send({
        email: validHospitalPayload.email,
        code: otpCode,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.message).toContain('Email verified');

    // Regression Check: verificationStatus MUST remain 'pending' — never auto-approved!
    const hospitalAfter = await Hospital.findById(regRes.body.hospitalId);
    expect(hospitalAfter.emailVerified).toBe(true);
    expect(hospitalAfter.verificationStatus).toBe('pending');
    expect(hospitalAfter.verificationOtp).toBeNull();
    expect(hospitalAfter.verificationOtpExpiresAt).toBeNull();
  });

  it('POST /api/hospital/verify-email rejects invalid code', async () => {
    await request(app)
      .post('/api/hospital/register')
      .send(validHospitalPayload);

    const verifyRes = await request(app)
      .post('/api/hospital/verify-email')
      .send({
        email: validHospitalPayload.email,
        code: '999999',
      });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.success).toBe(false);
    expect(verifyRes.body.error).toBe('Invalid or expired verification code.');
  });

  it('POST /api/hospital/resend-email-code respects 60s cooldown and provides generic response', async () => {
    await request(app)
      .post('/api/hospital/register')
      .send(validHospitalPayload);

    // Immediate resend should trigger 429 cooldown
    const resendRes1 = await request(app)
      .post('/api/hospital/resend-email-code')
      .send({ email: validHospitalPayload.email });

    expect(resendRes1.status).toBe(429);
    expect(resendRes1.body.success).toBe(false);
    expect(resendRes1.body.error).toContain('60 seconds');

    // Resend for non-existent email returns generic 200 (anti-enumeration)
    const resendRes2 = await request(app)
      .post('/api/hospital/resend-email-code')
      .send({ email: 'nonexistent@hospital.org' });

    expect(resendRes2.status).toBe(200);
    expect(resendRes2.body.success).toBe(true);
  });
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