// tests/integration/sharedAuth.test.js
const request = require('supertest');
const express = require('express');
const sharedAuthRoutes = require('../../src/routes/sharedAuthRoutes');
const errorHandler = require('../../src/middleware/errorHandler');
const Hospital = require('../../src/models/Hospital');
const SuperAdmin = require('../../src/models/SuperAdmin');
const { hashPassword } = require('../../src/utils/hashPassword');

const app = express();
app.use(express.json());
app.use('/api/auth', sharedAuthRoutes);
app.use(errorHandler);

describe('Integration Tests: Shared Login (/api/auth/login)', () => {
  test('POST /api/auth/login -> should reject unverified hospital login (401)', async () => {
    const hashedPassword = await hashPassword('StrongPassword123!');
    await Hospital.create({
      hospitalName: 'Unverified Hospital',
      email: 'unverified@hospital.org',
      passwordHash: hashedPassword,
      phone: '+251911000001',
      licenseNumber: 'LIC-001',
      location: { type: 'Point', coordinates: [38.7, 9.0] },
      emailVerified: false,
      agreedToTerms: true
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unverified@hospital.org', password: 'StrongPassword123!' });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/verify your email/i);
  });

  test('POST /api/auth/login -> should allow verified hospital login and return JWT (200)', async () => {
    const hashedPassword = await hashPassword('StrongPassword123!');
    await Hospital.create({
      hospitalName: 'Verified Hospital',
      email: 'verified@hospital.org',
      passwordHash: hashedPassword,
      phone: '+251911000002',
      licenseNumber: 'LIC-002',
      location: { type: 'Point', coordinates: [38.7, 9.0] },
      emailVerified: true,
      agreedToTerms: true
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'verified@hospital.org', password: 'StrongPassword123!' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.role).toBe('hospital');
    expect(res.body).toHaveProperty('token');
  });

  test('POST /api/auth/login -> should allow SuperAdmin login (200)', async () => {
    const hashedPassword = await hashPassword('SuperAdminPass123!');
    await SuperAdmin.create({
      name: 'System Admin',
      email: 'admin@legash.org',
      passwordHash: hashedPassword
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@legash.org', password: 'SuperAdminPass123!' });

    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('superadmin');
    expect(res.body.user.email).toBe('admin@legash.org');
  });
});