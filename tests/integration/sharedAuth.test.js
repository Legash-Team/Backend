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
      verificationStatus: 'approved',
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

  test('POST /api/auth/login -> should reject hospital login if verificationStatus is pending (401)', async () => {
    const hashedPassword = await hashPassword('StrongPassword123!');
    await Hospital.create({
      hospitalName: 'Pending Hospital',
      email: 'pending@hospital.org',
      passwordHash: hashedPassword,
      phone: '+251911000003',
      licenseNumber: 'LIC-003',
      location: { type: 'Point', coordinates: [38.7, 9.0] },
      emailVerified: true,
      verificationStatus: 'pending',
      agreedToTerms: true
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pending@hospital.org', password: 'StrongPassword123!' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Your account is still pending Super Admin approval.');
  });

  test('POST /api/auth/login -> should reject hospital login if verificationStatus is rejected (401)', async () => {
    const hashedPassword = await hashPassword('StrongPassword123!');
    await Hospital.create({
      hospitalName: 'Rejected Hospital',
      email: 'rejected@hospital.org',
      passwordHash: hashedPassword,
      phone: '+251911000004',
      licenseNumber: 'LIC-004',
      location: { type: 'Point', coordinates: [38.7, 9.0] },
      emailVerified: true,
      verificationStatus: 'rejected',
      agreedToTerms: true
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rejected@hospital.org', password: 'StrongPassword123!' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Your registration was not approved. Check your email for details.');
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