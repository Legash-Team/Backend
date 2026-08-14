// tests/future/passwordReset.test.js
const request = require('supertest');
const express = require('express');
const sharedAuthRoutes = require('../../src/routes/sharedAuthRoutes');
const app = express();
app.use(express.json());
app.use('/api/auth', sharedAuthRoutes);

describe('Future Tests: Forgot & Reset Password Popup API', () => {
  test.skip('POST /api/auth/forgot-password -> returns identical generic message for valid or invalid email (anti-enumeration)', async () => {
    const resExist = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'verified@hospital.org' });

    const resNotExist = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent@hospital.org' });

    expect(resExist.statusCode).toBe(200);
    expect(resNotExist.statusCode).toBe(200);
    expect(resExist.body.message).toEqual(resNotExist.body.message);
  });

  test.skip('POST /api/auth/reset-password -> fails on expired or invalid 6-digit code', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        email: 'verified@hospital.org',
        code: '000000',
        newPassword: 'NewStrongPassword123!'
      });

    expect(res.statusCode).toBe(400);
  });
});