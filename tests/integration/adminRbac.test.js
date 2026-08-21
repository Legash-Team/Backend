const request = require('supertest');
const express = require('express');
const superAdminRoutes = require('../../src/routes/superAdminRoutes');
const errorHandler = require('../../src/middleware/errorHandler');
const verifyToken = require('../../src/middleware/authMiddleware');
const requirePermission = require('../../src/middleware/requirePermission');
const Admin = require('../../src/models/Admin');
const SuperAdmin = require('../../src/models/SuperAdmin');
const generateToken = require('../../src/utils/generateToken');
const { hashPassword } = require('../../src/utils/hashPassword');

const app = express();
app.use(express.json());
app.use('/api/superadmin', superAdminRoutes);

// Test routes to verify requirePermission middleware behavior in action
app.get(
  '/api/test/approve-hospital-action',
  verifyToken,
  requirePermission('canApproveHospitals'),
  (req, res) => res.json({ success: true, message: 'Hospital action permitted.' })
);

app.get(
  '/api/test/post-event-action',
  verifyToken,
  requirePermission('canPostEvents'),
  (req, res) => res.json({ success: true, message: 'Event action permitted.' })
);

app.use(errorHandler);

describe('Integration Tests: Admin Creation, Listing, OTP Verification & RBAC', () => {
  let superAdminToken;
  let superAdminUser;

  beforeEach(async () => {
    await Admin.deleteMany({});
    await SuperAdmin.deleteMany({});

    const passwordHash = await hashPassword('SuperSecret123!');
    superAdminUser = await SuperAdmin.create({
      name: 'Root SuperAdmin',
      email: 'root@legash.org',
      passwordHash
    });

    superAdminToken = generateToken({
      id: superAdminUser._id.toString(),
      role: 'superadmin'
    });
  });

  describe('POST /api/superadmin/admins', () => {
    test('Super Admin creates an Admin account with specific permissions and receives 201', async () => {
      const res = await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Hospital Approver Admin',
          email: 'approver@legash.org',
          permissions: {
            canApproveHospitals: true,
            canPostEvents: false
          }
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.admin).toMatchObject({
        name: 'Hospital Approver Admin',
        email: 'approver@legash.org',
        emailVerified: false,
        permissions: {
          canApproveHospitals: true,
          canPostEvents: false
        }
      });

      const savedAdmin = await Admin.findOne({ email: 'approver@legash.org' });
      expect(savedAdmin).toBeDefined();
      expect(savedAdmin.verificationOtp).toHaveLength(6);
      expect(savedAdmin.emailVerified).toBe(false);
    });

    test('Rejects request without Super Admin token with 401 or 403', async () => {
      const hospitalToken = generateToken({ id: 'dummy_id', role: 'hospital' });

      const resNoToken = await request(app)
        .post('/api/superadmin/admins')
        .send({
          name: 'Unauthorized Admin',
          email: 'unauthorized@legash.org'
        });
      expect(resNoToken.statusCode).toBe(401);

      const resWrongRole = await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          name: 'Unauthorized Admin',
          email: 'unauthorized@legash.org'
        });
      expect(resWrongRole.statusCode).toBe(403);
    });
  });

  describe('GET /api/superadmin/admins', () => {
    test('Super Admin lists all created Admins', async () => {
      await Admin.create({
        name: 'Admin Alpha',
        email: 'alpha@legash.org',
        verificationOtp: '123456',
        permissions: { canApproveHospitals: true, canPostEvents: false }
      });
      await Admin.create({
        name: 'Admin Beta',
        email: 'beta@legash.org',
        verificationOtp: '654321',
        permissions: { canApproveHospitals: false, canPostEvents: true }
      });

      const res = await request(app)
        .get('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.admins).toHaveLength(2);
      expect(res.body.admins[0]).toHaveProperty('id');
      expect(res.body.admins[0]).toHaveProperty('name');
      expect(res.body.admins[0]).toHaveProperty('email');
      expect(res.body.admins[0]).toHaveProperty('permissions');
      expect(res.body.admins[0].passwordHash).toBeUndefined();
      expect(res.body.admins[0].verificationOtp).toBeUndefined();
    });
  });

  describe('POST /api/superadmin/admins/verify-otp', () => {
    test('Public endpoint verifies OTP and sets emailVerified to true', async () => {
      await Admin.create({
        name: 'Pending Admin',
        email: 'pending@legash.org',
        verificationOtp: '849201',
        verificationOtpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        emailVerified: false
      });

      const res = await request(app)
        .post('/api/superadmin/admins/verify-otp')
        .send({
          email: 'pending@legash.org',
          otp: '849201'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/email verified successfully/i);

      const verifiedAdmin = await Admin.findOne({ email: 'pending@legash.org' });
      expect(verifiedAdmin.emailVerified).toBe(true);
      expect(verifiedAdmin.verificationOtp).toBeNull();
    });

    test('Rejects invalid OTP with 400', async () => {
      await Admin.create({
        name: 'Pending Admin 2',
        email: 'pending2@legash.org',
        verificationOtp: '849201',
        verificationOtpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        emailVerified: false
      });

      const res = await request(app)
        .post('/api/superadmin/admins/verify-otp')
        .send({
          email: 'pending2@legash.org',
          otp: '000000'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('RBAC Middleware (requirePermission) verification', () => {
    test('Super Admin is permitted on any permission-gated route', async () => {
      const res = await request(app)
        .get('/api/test/approve-hospital-action')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Admin with canApproveHospitals is permitted on approve-hospital route but blocked on post-event route', async () => {
      const admin = await Admin.create({
        name: 'Approver Only',
        email: 'approveronly@legash.org',
        emailVerified: true,
        permissions: {
          canApproveHospitals: true,
          canPostEvents: false
        }
      });

      const adminToken = generateToken({
        id: admin._id.toString(),
        role: 'admin',
        permissions: admin.permissions
      });

      const resAllowed = await request(app)
        .get('/api/test/approve-hospital-action')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAllowed.statusCode).toBe(200);

      const resDenied = await request(app)
        .get('/api/test/post-event-action')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resDenied.statusCode).toBe(403);
      expect(resDenied.body.error).toMatch(/permission/i);
    });
  });
});
