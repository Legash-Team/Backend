// tests/integration/hospitalAuth.test.js
const request = require('supertest');
const express = require('express');
const hospitalAuthRoutes = require('../../src/routes/hospitalAuthRoutes');
const errorHandler = require('../../src/middleware/errorHandler');
const Hospital = require('../../src/models/Hospital');

const app = express();
app.use(express.json());
app.use('/api/hospitals', hospitalAuthRoutes);
app.use(errorHandler);

describe('Integration Tests: Hospital Auth', () => {
  const validHospitalData = {
    name: 'St. Paul Hospital',
    email: 'contact@stpaul.edu.et',
    password: 'StrongPassword123!',
    phone: '+251911223344',
    licenseNumber: 'HOSP-ETH-789',
    location: {
      coordinates: [38.75, 9.03],
      address: 'Addis Ababa, Ethiopia'
    }
  };

  test('POST /api/hospitals/register -> should register new hospital (201)', async () => {
    const res = await request(app)
      .post('/api/hospitals/register')
      .send(validHospitalData);

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('hospitalId');

    // Verify DB state
    const saved = await Hospital.findById(res.body.hospitalId);
    expect(saved).not.toBeNull();
    expect(saved.isEmailVerified).toBe(false);
    expect(saved.email).toBe('contact@stpaul.edu.et');
  });

  test('POST /api/hospitals/register -> should fail validation on bad phone format (400)', async () => {
    const res = await request(app)
      .post('/api/hospitals/register')
      .send({ ...validHospitalData, phone: '0911223344' }); // Missing +251

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/hospitals/verify-email/:token -> should verify hospital email (200)', async () => {
    // 1. Create unverified hospital directly in DB
    const hospital = await Hospital.create({
      ...validHospitalData,
      password: 'hashedpassword'
    });

    // 2. Perform verification request
    const res = await request(app)
      .get(`/api/hospitals/verify-email/${hospital._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // 3. Confirm verified status in DB
    const updated = await Hospital.findById(hospital._id);
    expect(updated.isEmailVerified).toBe(true);
  });
});