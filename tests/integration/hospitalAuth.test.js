// tests/integration/hospitalAuth.test.js
const request = require('supertest');
const express = require('express');
const hospitalAuthRoutes = require('../../src/routes/hospitalAuthRoutes');
const errorHandler = require('../../src/middleware/errorHandler');
const Hospital = require('../../src/models/Hospital');

const app = express();
app.use(express.json());
app.use('/api/hospital', hospitalAuthRoutes);
app.use(errorHandler);

describe('Integration Tests: Hospital Auth', () => {
  const validHospitalData = {
    hospitalName: 'St. Paul Hospital',
    email: 'contact@stpaul.edu.et',
    password: 'StrongPassword123!',
    phone: '+251911223344',
    licenseNumber: 'HOSP-ETH-789',
    location: {
      lat: 9.03,
      lng: 38.75
    },
    agreedToTerms: true
  };

  test('POST /api/hospital/register -> should register new hospital (201)', async () => {
    const res = await request(app)
      .post('/api/hospital/register')
      .send(validHospitalData);

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('hospitalId');

    // Verify DB state
    const saved = await Hospital.findById(res.body.hospitalId);
    expect(saved).not.toBeNull();
    expect(saved.emailVerified).toBe(false);
    expect(saved.email).toBe('contact@stpaul.edu.et');
  });

  test('POST /api/hospital/register -> should fail validation on bad phone format (400)', async () => {
    const res = await request(app)
      .post('/api/hospital/register')
      .send({ ...validHospitalData, phone: '0911223344' }); // Missing +251

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/hospital/verify-email?token=<token> -> should verify hospital email (200)', async () => {
    // 1. Create unverified hospital directly in DB
    const verificationToken = 'test-token-123';
    const hospital = await Hospital.create({
      ...validHospitalData,
      passwordHash: 'hashedpassword',
      location: { type: 'Point', coordinates: [38.75, 9.03] }, // DB shape
      verificationToken
    });

    // 2. Perform verification request
    const res = await request(app)
      .get(`/api/hospital/verify-email?token=${verificationToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // 3. Confirm verified status in DB
    const updated = await Hospital.findById(hospital._id);
    expect(updated.emailVerified).toBe(true);
    expect(updated.verificationToken).toBeNull();
  });
});