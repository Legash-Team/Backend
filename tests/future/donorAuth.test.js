// tests/future/donorAuth.test.js
const request = require('supertest');
const express = require('express');
const donorAuthRoutes = require('../../src/routes/donorAuthRoutes');
const errorHandler = require('../../src/middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/donor', donorAuthRoutes);
app.use(errorHandler);

describe('Future Tests: Donor Registration & OTP Flow', () => {
  const donorData = {
    name: 'Abebe Bikila',
    phone: '+251911223344',
    password: 'StrongPassword123!',
    fin: 'FIN-12345678',
    gender: 'male',
    bloodType: 'O+',
    location: { lat: 9.03, lng: 38.75 },
    agreedToTerms: true
  };

  test.skip('POST /api/donor/register -> creates unverified donor and triggers OTP', async () => {
    const res = await request(app).post('/api/donor/register').send(donorData);
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/OTP/i);
  });

  test.skip('POST /api/donor/login -> rejects login before OTP verification (401)', async () => {
    const res = await request(app)
      .post('/api/donor/login')
      .send({ phone: donorData.phone, password: donorData.password });
    expect(res.statusCode).toBe(401);
  });

  test.skip('POST /api/donor/verify-otp -> sets phoneVerified to true', async () => {
    const res = await request(app)
      .post('/api/donor/verify-otp')
      .send({ phone: donorData.phone, code: '123456' });
    expect(res.statusCode).toBe(200);
  });
});