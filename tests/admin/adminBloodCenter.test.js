// tests/admin/adminBloodCenter.test.js
const request = require('supertest');
const express = require('express');
const superAdminRoutes = require('../../src/routes/superAdminRoutes');
const sharedAuthRoutes = require('../../src/routes/sharedAuthRoutes');
const errorHandler = require('../../src/middleware/errorHandler');
const verifyToken = require('../../src/middleware/authMiddleware');
const requirePermission = require('../../src/middleware/requirePermission');
const Admin = require('../../src/models/Admin');
const SuperAdmin = require('../../src/models/SuperAdmin');
const emailService = require('../../src/services/emailService');
const generateToken = require('../../src/utils/generateToken');
const { hashPassword, comparePassword } = require('../../src/utils/hashPassword');

const app = express();
app.use(express.json());
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/auth', sharedAuthRoutes);

// Permission-protected test route to verify token usability
app.get(
  '/api/test/blood-center-approver-check',
  verifyToken,
  requirePermission('canApproveHospitals'),
  (req, res) => res.json({ success: true, message: 'Admin authorized for hospital approvals.' })
);

app.use(errorHandler);

describe('Feature A3 — Admin/Blood Center Invitation and Self-Registration', () => {
  let superAdminToken;
  let superAdminUser;

  beforeEach(async () => {
    await Admin.deleteMany({});
    await SuperAdmin.deleteMany({});
    jest.clearAllMocks();

    const superAdminHash = await hashPassword('SuperAdminSecret123!');
    superAdminUser = await SuperAdmin.create({
      name: 'Root SuperAdmin',
      email: 'superadmin@legash.org',
      passwordHash: superAdminHash
    });

    superAdminToken = generateToken({
      id: superAdminUser._id.toString(),
      role: 'superadmin'
    });
  });

  // 1. Super Admin can invite an Admin with email and permissions without providing Blood Center profile fields or a password
  test('1. Super Admin can invite an Admin with email and permissions without providing Blood Center profile fields or a password', async () => {
    const invitePayload = {
      email: 'invite.center@legash.org',
      permissions: {
        canApproveHospitals: true,
        canPostEvents: false
      }
    };

    const res = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(invitePayload);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.admin).toBeDefined();
    expect(res.body.admin.email).toBe('invite.center@legash.org');
    expect(res.body.admin.emailVerified).toBe(false);
    expect(res.body.admin.permissions).toEqual({
      canApproveHospitals: true,
      canPostEvents: false
    });

    // Check database state: pending, no profile fields, no password, no OTP
    const savedAdmin = await Admin.findOne({ email: 'invite.center@legash.org' });
    expect(savedAdmin).toBeDefined();
    expect(savedAdmin.emailVerified).toBe(false);
    expect(savedAdmin.passwordHash).toBeNull();
    expect(savedAdmin.centerName).toBeNull();
    expect(savedAdmin.phone).toBeNull();
    expect(savedAdmin.location).toBeUndefined();
    expect(savedAdmin.setupToken).toBeDefined();
    expect(savedAdmin.setupTokenExpiresAt).toBeDefined();
    expect(savedAdmin.verificationOtp).toBeNull();
    expect(savedAdmin.verificationOtpExpiresAt).toBeNull();

    // Verify raw MongoDB document has no location key
    const raw = await Admin.collection.findOne({ _id: savedAdmin._id });
    expect(raw.location).toBeUndefined();
  });

  // 2. Existing permission defaults and supported permission combinations remain unchanged
  test('2. Existing permission defaults and supported permission combinations remain unchanged', async () => {
    // 2a. Omitted permissions default to false for both canApproveHospitals and canPostEvents
    const resDefault = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'default.perms@legash.org' });

    expect(resDefault.statusCode).toBe(201);
    expect(resDefault.body.admin.permissions).toEqual({
      canApproveHospitals: false,
      canPostEvents: false
    });

    // 2b. Role string 'both' gives both permissions
    const resBoth = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'both.perms@legash.org', role: 'both' });

    expect(resBoth.statusCode).toBe(201);
    expect(resBoth.body.admin.permissions).toEqual({
      canApproveHospitals: true,
      canPostEvents: true
    });

    // 2c. Role string 'can approve hospitals'
    const resApprove = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'approve.perms@legash.org', role: 'can approve hospitals' });

    expect(resApprove.statusCode).toBe(201);
    expect(resApprove.body.admin.permissions).toEqual({
      canApproveHospitals: true,
      canPostEvents: false
    });

    // 2d. Explicit object with canPostEvents only
    const resEvents = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: 'events.perms@legash.org',
        permissions: { canApproveHospitals: false, canPostEvents: true }
      });

    expect(resEvents.statusCode).toBe(201);
    expect(resEvents.body.admin.permissions).toEqual({
      canApproveHospitals: false,
      canPostEvents: true
    });
  });

  // 3. Duplicate email is handled with the existing expected error status
  test('3. Duplicate email is handled with the existing expected error status (400)', async () => {
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'duplicate.center@legash.org' });

    const duplicateRes = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'duplicate.center@legash.org' });

    expect(duplicateRes.statusCode).toBe(400);
    expect(duplicateRes.body.success).toBe(false);
    expect(duplicateRes.body.error).toBe('An Admin with this email already exists.');
  });

  // 4. Invitation email/setup flow triggers exactly one setup email with 64-hex token and no OTP
  test('4. Invitation email/setup flow triggers exactly one setup email with 64-hex token and no OTP', async () => {
    const sendSetupEmailSpy = jest
      .spyOn(emailService, 'sendAdminSetupEmail')
      .mockResolvedValue({ success: true });
    const sendOtpSpy = jest
      .spyOn(emailService, 'sendAdminVerificationOtp')
      .mockResolvedValue({ success: true });

    const res = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: 'email.trigger@legash.org',
        permissions: { canApproveHospitals: true, canPostEvents: false }
      });

    expect(res.statusCode).toBe(201);

    // Verify background email service was called exactly once with setup link and token
    const savedAdmin = await Admin.findOne({ email: 'email.trigger@legash.org' });
    expect(savedAdmin.verificationOtp).toBeNull();
    expect(savedAdmin.verificationOtpExpiresAt).toBeNull();
    expect(savedAdmin.setupToken).toMatch(/^[0-9a-f]{64}$/);

    expect(sendSetupEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendSetupEmailSpy).toHaveBeenCalledWith(
      'email.trigger@legash.org',
      savedAdmin.setupToken,
      { canApproveHospitals: true, canPostEvents: false }
    );
    expect(sendOtpSpy).not.toHaveBeenCalled();

    // Response must NOT contain secret tokens
    expect(res.body.setupToken).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(res.body.admin.setupToken).toBeUndefined();
    expect(res.body.admin.verificationOtp).toBeUndefined();
    expect(res.body.admin.passwordHash).toBeUndefined();

    sendSetupEmailSpy.mockRestore();
    sendOtpSpy.mockRestore();
  });

  // 5. A valid invitation can complete registration with center name, phone, password, location (including required address), and terms acceptance
  test('5. A valid invitation can complete registration with center name, phone, password, location, and terms acceptance', async () => {
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: 'complete.center@legash.org',
        permissions: { canApproveHospitals: true, canPostEvents: false }
      });

    const invitedAdmin = await Admin.findOne({ email: 'complete.center@legash.org' });
    const rawSetupToken = invitedAdmin.setupToken;

    const registrationPayload = {
      token: rawSetupToken,
      centerName: 'Addis Ababa Central Blood Bank',
      phone: '+251115510000',
      password: 'SecurePassword123!',
      confirmPassword: 'SecurePassword123!',
      location: {
        lat: 9.015,
        lng: 38.751,
        address: 'Meskel Square, Addis Ababa'
      },
      termsAccepted: true
    };

    const res = await request(app).post('/api/auth/admin/setup').send(registrationPayload);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.admin).toBeDefined();
    expect(res.body.admin.centerName).toBe('Addis Ababa Central Blood Bank');
    expect(res.body.admin.phone).toBe('+251115510000');
    expect(res.body.admin.emailVerified).toBe(true);
    expect(res.body.admin.termsAccepted).toBe(true);
    expect(res.body.admin.location).toEqual({
      lat: 9.015,
      lng: 38.751,
      address: 'Meskel Square, Addis Ababa'
    });

    // Verify DB persistence
    const updatedAdmin = await Admin.findById(invitedAdmin._id);
    expect(updatedAdmin.centerName).toBe('Addis Ababa Central Blood Bank');
    expect(updatedAdmin.phone).toBe('+251115510000');
    expect(updatedAdmin.emailVerified).toBe(true);
    expect(updatedAdmin.termsAccepted).toBe(true);
    expect(updatedAdmin.location.type).toBe('Point');
    expect(updatedAdmin.location.coordinates).toEqual([38.751, 9.015]); // GeoJSON [lng, lat]
    expect(updatedAdmin.location.address).toBe('Meskel Square, Addis Ababa');
    expect(updatedAdmin.setupToken).toBeNull();
    expect(updatedAdmin.setupTokenExpiresAt).toBeNull();
  });

  // 6. Registration requires a valid location (missing location returns 400)
  test('6. Registration requires location (missing location returns 400)', async () => {
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'no.loc.center@legash.org' });

    const invited = await Admin.findOne({ email: 'no.loc.center@legash.org' });

    const res = await request(app).post('/api/auth/admin/setup').send({
      setupToken: invited.setupToken,
      centerName: 'Regional Mobile Blood Center',
      phone: '+251911223344',
      password: 'SecurePassword123!',
      termsAccepted: true
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/location is required/i);
  });

  // 7. Missing required registration fields or missing Terms acceptance are rejected
  describe('7. Missing required registration fields or missing Terms acceptance are rejected (400)', () => {
    let testToken;

    beforeEach(async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'validation.check@legash.org' });

      const admin = await Admin.findOne({ email: 'validation.check@legash.org' });
      testToken = admin.setupToken;
    });

    test('Rejects missing centerName', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/center name/i);
    });

    test('Rejects missing phone', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        centerName: 'Valid Blood Bank',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/phone/i);
    });

    test('Rejects short password (< 8 chars)', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        centerName: 'Valid Blood Bank',
        phone: '+251115510000',
        password: 'short',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/at least 8 characters/i);
    });

    test('Rejects password confirmation mismatch', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        centerName: 'Valid Blood Bank',
        phone: '+251115510000',
        password: 'Password123!',
        confirmPassword: 'MismatchPassword123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/confirmation does not match/i);
    });

    test('Rejects missing termsAccepted (or termsAccepted: false)', async () => {
      const resMissing = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        centerName: 'Valid Blood Bank',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' }
      });

      expect(resMissing.statusCode).toBe(400);
      expect(resMissing.body.error).toMatch(/terms of service/i);

      const resFalse = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        centerName: 'Valid Blood Bank',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: false
      });

      expect(resFalse.statusCode).toBe(400);
      expect(resFalse.body.error).toMatch(/terms of service/i);
    });
  });

  // 8. Invalid latitude, longitude, malformed coordinates, and non-numeric coordinates return HTTP 400
  describe('8. Coordinate validation rejects malformed or out-of-range coordinates with 400', () => {
    let coordToken;

    beforeEach(async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'coord.check@legash.org' });

      const admin = await Admin.findOne({ email: 'coord.check@legash.org' });
      coordToken = admin.setupToken;
    });

    const basePayload = () => ({
      token: coordToken,
      centerName: 'Coord Test Center',
      phone: '+251115510000',
      password: 'Password123!',
      termsAccepted: true
    });

    test('Rejects latitude > 90', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 91, lng: 38.7, address: 'Stadium Area' } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between -90 and 90/i);
    });

    test('Rejects latitude < -90', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: -91, lng: 38.7, address: 'Stadium Area' } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between -90 and 90/i);
    });

    test('Rejects longitude > 180', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 9.0, lng: 181, address: 'Stadium Area' } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between -180 and 180/i);
    });

    test('Rejects longitude < -180', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 9.0, lng: -181, address: 'Stadium Area' } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between -180 and 180/i);
    });

    test('Rejects non-numeric latitude or longitude strings', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 'nine', lng: 38.7, address: 'Stadium Area' } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/finite numbers/i);
    });

    test('Rejects incomplete location without lng', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 9.0, address: 'Stadium Area' } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/valid coordinates or lat\/lng/i);
    });

    test('Rejects primitive string location', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: 'Addis Ababa' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/location is required/i);
    });
  });

  // 9. Valid coordinates are saved in [longitude, latitude] order
  test('9. Valid coordinates are saved in [longitude, latitude] order', async () => {
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'geojson.order@legash.org' });

    const admin = await Admin.findOne({ email: 'geojson.order@legash.org' });

    const res = await request(app)
      .post('/api/auth/admin/setup')
      .send({
        token: admin.setupToken,
        centerName: 'GeoJSON Test Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.02, lng: 38.74, address: 'Bole Road, Addis Ababa' },
        termsAccepted: true
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.admin.location).toEqual({
      lat: 9.02,
      lng: 38.74,
      address: 'Bole Road, Addis Ababa'
    });

    const saved = await Admin.findById(admin._id);
    expect(saved.location.type).toBe('Point');
    // GeoJSON Point coordinates format: [lng, lat]
    expect(saved.location.coordinates[0]).toBe(38.74); // Longitude
    expect(saved.location.coordinates[1]).toBe(9.02); // Latitude
    expect(saved.location.address).toBe('Bole Road, Addis Ababa');
  });

  // 10. The password is hashed and never returned
  test('10. The password is hashed using established utility and never returned in plaintext or hash', async () => {
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'password.hash@legash.org' });

    const admin = await Admin.findOne({ email: 'password.hash@legash.org' });
    const rawPassword = 'SuperSecretPlainPassword123!';

    const res = await request(app).post('/api/auth/admin/setup').send({
      token: admin.setupToken,
      centerName: 'Hash Center',
      phone: '+251115510000',
      password: rawPassword,
      location: { lat: 9.015, lng: 38.751, address: 'Stadium Area, Addis Ababa' },
      termsAccepted: true
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.password).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.admin.password).toBeUndefined();
    expect(res.body.admin.passwordHash).toBeUndefined();

    const saved = await Admin.findById(admin._id);
    expect(saved.passwordHash).toBeDefined();
    expect(saved.passwordHash).not.toBe(rawPassword);
    const isMatch = await comparePassword(rawPassword, saved.passwordHash);
    expect(isMatch).toBe(true);
  });

  // 11. Invalid, expired, reused, or mismatched invitation tokens are rejected according to existing token rules
  test('11. Invalid, expired, and reused setup tokens are rejected with HTTP 400', async () => {
    // 11a. Invalid token
    const resInvalid = await request(app).post('/api/auth/admin/setup').send({
      token: 'invalid_non_existent_token_999999',
      centerName: 'Some Center',
      phone: '+251115510000',
      password: 'Password123!',
      location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
      termsAccepted: true
    });

    expect(resInvalid.statusCode).toBe(400);
    expect(resInvalid.body.error).toMatch(/invalid or expired setup token/i);

    // 11b. Expired token
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'expired.token@legash.org' });

    const expiredAdmin = await Admin.findOne({ email: 'expired.token@legash.org' });
    expiredAdmin.setupTokenExpiresAt = new Date(Date.now() - 60000); // 1 minute in the past
    await expiredAdmin.save();

    const resExpired = await request(app).post('/api/auth/admin/setup').send({
      token: expiredAdmin.setupToken,
      centerName: 'Expired Center',
      phone: '+251115510000',
      password: 'Password123!',
      location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
      termsAccepted: true
    });

    expect(resExpired.statusCode).toBe(400);
    expect(resExpired.body.error).toMatch(/invalid or expired setup token/i);

    // 11c. Reused token
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'reuse.token@legash.org' });

    const reusableAdmin = await Admin.findOne({ email: 'reuse.token@legash.org' });
    const tokenToReuse = reusableAdmin.setupToken;

    // First use: succeeds
    const firstUseRes = await request(app).post('/api/auth/admin/setup').send({
      token: tokenToReuse,
      centerName: 'Reused Center',
      phone: '+251115510000',
      password: 'Password123!',
      location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
      termsAccepted: true
    });
    expect(firstUseRes.statusCode).toBe(200);

    // Second use: fails because token was cleared
    const secondUseRes = await request(app).post('/api/auth/admin/setup').send({
      token: tokenToReuse,
      centerName: 'Reused Center',
      phone: '+251115510000',
      password: 'Password123!',
      location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
      termsAccepted: true
    });
    expect(secondUseRes.statusCode).toBe(400);
    expect(secondUseRes.body.error).toMatch(/invalid or expired setup token/i);
  });

  // 12. The invited Admin's assigned permissions survive account completion unchanged
  test("12. The invited Admin's assigned permissions survive account completion unchanged despite client tampering", async () => {
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: 'tamper.proof@legash.org',
        permissions: { canApproveHospitals: true, canPostEvents: false }
      });

    const admin = await Admin.findOne({ email: 'tamper.proof@legash.org' });

    // Client attempts to grant itself canPostEvents and alter email
    const res = await request(app)
      .post('/api/auth/admin/setup')
      .send({
        token: admin.setupToken,
        centerName: 'Tamper Proof Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true,
        permissions: { canApproveHospitals: false, canPostEvents: true },
        email: 'attacker@evil.com'
      });

    expect(res.statusCode).toBe(200);

    const saved = await Admin.findById(admin._id);
    expect(saved.email).toBe('tamper.proof@legash.org');
    expect(saved.permissions.canApproveHospitals).toBe(true);
    expect(saved.permissions.canPostEvents).toBe(false);
  });

  // 13. The completed Admin can satisfy the existing login flow
  test('13. The completed Admin can satisfy the existing login flow and access authorized endpoints', async () => {
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: 'login.test.center@legash.org',
        permissions: { canApproveHospitals: true, canPostEvents: false }
      });

    const admin = await Admin.findOne({ email: 'login.test.center@legash.org' });

    const setupRes = await request(app).post('/api/auth/admin/setup').send({
      token: admin.setupToken,
      centerName: 'Bole Regional Blood Bank',
      phone: '+251115510000',
      password: 'BloodCenterPass123!',
      location: { lat: 9.015, lng: 38.751, address: 'Bole Road, Addis Ababa' },
      termsAccepted: true
    });
    expect(setupRes.statusCode).toBe(200);

    // Sign in via unified login endpoint
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'login.test.center@legash.org',
      password: 'BloodCenterPass123!'
    });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.role).toBe('admin');
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.permissions).toEqual({
      canApproveHospitals: true,
      canPostEvents: false
    });
    expect(loginRes.body.user).toMatchObject({
      id: admin._id.toString(),
      email: 'login.test.center@legash.org',
      centerName: 'Bole Regional Blood Bank'
    });

    // Test authorization on requirePermission protected endpoint
    const adminJwt = loginRes.body.token;
    const testRouteRes = await request(app)
      .get('/api/test/blood-center-approver-check')
      .set('Authorization', `Bearer ${adminJwt}`);

    expect(testRouteRes.statusCode).toBe(200);
    expect(testRouteRes.body.success).toBe(true);
    expect(testRouteRes.body.message).toBe('Admin authorized for hospital approvals.');
  });

  // 14. Existing Admin documents without the new profile fields remain valid
  test('14. Existing Admin documents without the new profile fields remain valid', async () => {
    const legacyAdmin = new Admin({
      name: 'Legacy Admin User',
      email: 'legacy.admin.user@legash.org',
      passwordHash: 'some_legacy_hash_value',
      emailVerified: true,
      permissions: { canApproveHospitals: false, canPostEvents: true }
    });

    const validationError = legacyAdmin.validateSync();
    expect(validationError).toBeUndefined();

    await legacyAdmin.save();

    const retrieved = await Admin.findById(legacyAdmin._id);
    expect(retrieved).toBeDefined();
    expect(retrieved.centerName).toBeNull();
    expect(retrieved.phone).toBeNull();
    expect(retrieved.location).toBeUndefined();
    expect(retrieved.termsAccepted).toBe(false);

    // Raw MongoDB document check: location key is completely missing
    const raw = await Admin.collection.findOne({ _id: legacyAdmin._id });
    expect(raw.location).toBeUndefined();
  });

  // 15. No response leaks password hashes, OTPs, setup tokens, or secret fields
  test('15. No response leaks password hashes, OTPs, setup tokens, or internal secrets', async () => {
    // 15a. Super Admin invite response
    const inviteRes = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'leak.check@legash.org' });

    const inviteBodyStr = JSON.stringify(inviteRes.body);
    expect(inviteBodyStr).not.toMatch(/passwordHash/i);
    expect(inviteBodyStr).not.toMatch(/setupToken/i);
    expect(inviteBodyStr).not.toMatch(/verificationOtp/i);

    const admin = await Admin.findOne({ email: 'leak.check@legash.org' });

    // 15b. Account completion response
    const setupRes = await request(app).post('/api/auth/admin/setup').send({
      token: admin.setupToken,
      centerName: 'Leak Check Blood Center',
      phone: '+251115510000',
      password: 'Password123!',
      location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
      termsAccepted: true
    });

    const setupBodyStr = JSON.stringify(setupRes.body);
    expect(setupBodyStr).not.toMatch(/passwordHash/i);
    expect(setupBodyStr).not.toMatch(/setupToken/i);
    expect(setupBodyStr).not.toMatch(/verificationOtp/i);

    // 15c. Login response
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'leak.check@legash.org',
      password: 'Password123!'
    });

    const loginBodyStr = JSON.stringify(loginRes.body);
    expect(loginBodyStr).not.toMatch(/passwordHash/i);
    expect(loginBodyStr).not.toMatch(/setupToken/i);
    expect(loginBodyStr).not.toMatch(/verificationOtp/i);
  });

  // 16. Token strength, expiry, and null verificationOtp validation
  test('16. Setup token is 64-character hex, expires in ~48 hours, and verificationOtp remains null at invite', async () => {
    const beforeInvite = Date.now();

    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'token.strength@legash.org' });

    const afterInvite = Date.now();
    const admin = await Admin.findOne({ email: 'token.strength@legash.org' });

    expect(admin).toBeDefined();
    // 64-char hex setup token
    expect(admin.setupToken).toMatch(/^[0-9a-f]{64}$/);
    // verificationOtp is null at invitation (no OTP sent)
    expect(admin.verificationOtp).toBeNull();
    expect(admin.verificationOtpExpiresAt).toBeNull();

    // 48-hour expiration
    const expiryMs = new Date(admin.setupTokenExpiresAt).getTime();
    const hoursFromBefore = (expiryMs - beforeInvite) / (1000 * 60 * 60);
    const hoursFromAfter = (expiryMs - afterInvite) / (1000 * 60 * 60);
    expect(hoursFromBefore).toBeLessThanOrEqual(48.05);
    expect(hoursFromAfter).toBeGreaterThanOrEqual(47.95);
  });

  // 17. Security rejections for adminSetup: non-string token, active admin, soft-deleted admin
  describe('17. Security rejections for adminSetup (non-string token, active admin, soft-deleted admin)', () => {
    let validToken;

    beforeEach(async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'security.check@legash.org' });

      const admin = await Admin.findOne({ email: 'security.check@legash.org' });
      validToken = admin.setupToken;
    });

    test('Rejects non-string token object or array with 400', async () => {
      const resObj = await request(app).post('/api/auth/admin/setup').send({
        token: { $gt: '' },
        centerName: 'Security Blood Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });
      expect(resObj.statusCode).toBe(400);
      expect(resObj.body.error).toMatch(/invalid or expired setup token/i);

      const resNum = await request(app).post('/api/auth/admin/setup').send({
        token: 123456789,
        centerName: 'Security Blood Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });
      expect(resNum.statusCode).toBe(400);
      expect(resNum.body.error).toMatch(/invalid or expired setup token/i);

      const resEmpty = await request(app).post('/api/auth/admin/setup').send({
        token: '   ',
        centerName: 'Security Blood Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });
      expect(resEmpty.statusCode).toBe(400);
      expect(resEmpty.body.error).toMatch(/invalid or expired setup token/i);
    });

    test('Rejects setup for active admin (already has passwordHash)', async () => {
      const admin = await Admin.findOne({ email: 'security.check@legash.org' });
      admin.passwordHash = await hashPassword('ExistingPassword123!');
      await admin.save();

      const res = await request(app).post('/api/auth/admin/setup').send({
        token: validToken,
        centerName: 'Active Blood Center',
        phone: '+251115510000',
        password: 'NewPassword123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid or expired setup token/i);
    });

    test('Rejects setup for soft-deleted admin (isDeleted: true)', async () => {
      const admin = await Admin.findOne({ email: 'security.check@legash.org' });
      admin.isDeleted = true;
      await admin.save();

      const res = await request(app).post('/api/auth/admin/setup').send({
        token: validToken,
        centerName: 'Deleted Blood Center',
        phone: '+251115510000',
        password: 'NewPassword123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid or expired setup token/i);
    });
  });

  // 18. Phone format validation (+251 followed by 9 digits)
  describe('18. Phone format validation (+251 followed by 9 digits)', () => {
    let phoneToken;

    beforeEach(async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'phone.validate@legash.org' });

      const admin = await Admin.findOne({ email: 'phone.validate@legash.org' });
      phoneToken = admin.setupToken;
    });

    const sendWithPhone = (phone) =>
      request(app).post('/api/auth/admin/setup').send({
        token: phoneToken,
        centerName: 'Phone Validation Center',
        phone,
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

    test('Accepts valid phone +251911000000', async () => {
      const res = await sendWithPhone('+251911000000');
      expect(res.statusCode).toBe(200);
      expect(res.body.admin.phone).toBe('+251911000000');
    });

    test('Rejects phone in local 09 format (0911000000)', async () => {
      const res = await sendWithPhone('0911000000');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/\+251 format/i);
    });

    test('Rejects phone with too few digits (+25191100000)', async () => {
      const res = await sendWithPhone('+25191100000');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/\+251 format/i);
    });

    test('Rejects alphabetic phone (abc)', async () => {
      const res = await sendWithPhone('abc');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/\+251 format/i);
    });

    test('Rejects empty phone string', async () => {
      const res = await sendWithPhone('');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/\+251 format/i);
    });
  });

  // 19. Blood Center name validation (trimmed 2-120 chars)
  describe('19. Blood Center name validation (trimmed 2-120 chars)', () => {
    let nameToken;

    beforeEach(async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'name.validate@legash.org' });

      const admin = await Admin.findOne({ email: 'name.validate@legash.org' });
      nameToken = admin.setupToken;
    });

    const sendWithName = (centerName) =>
      request(app).post('/api/auth/admin/setup').send({
        token: nameToken,
        centerName,
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

    test('Rejects 1-character center name', async () => {
      const res = await sendWithName('A');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between 2 and 120 characters/i);
    });

    test('Rejects 121-character center name', async () => {
      const res = await sendWithName('A'.repeat(121));
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between 2 and 120 characters/i);
    });

    test('Rejects whitespace-only center name', async () => {
      const res = await sendWithName('     ');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between 2 and 120 characters/i);
    });

    test('Accepts 2-character center name', async () => {
      const res = await sendWithName('BB');
      expect(res.statusCode).toBe(200);
      expect(res.body.admin.centerName).toBe('BB');
    });

    test('Accepts 120-character center name', async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'name120.validate@legash.org' });
      const admin = await Admin.findOne({ email: 'name120.validate@legash.org' });

      const res = await request(app).post('/api/auth/admin/setup').send({
        token: admin.setupToken,
        centerName: 'B'.repeat(120),
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.admin.centerName).toBe('B'.repeat(120));
    });
  });

  // 20. Address validation and persistence (required, 3-200 chars, rejected if missing/too short/too long)
  describe('20. Address validation and persistence (required, 3-200 chars)', () => {
    let addressToken;

    beforeEach(async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'address.validate@legash.org' });

      const admin = await Admin.findOne({ email: 'address.validate@legash.org' });
      addressToken = admin.setupToken;
    });

    test('Saves and returns valid address', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: addressToken,
        centerName: 'Address Test Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: {
          lat: 9.015,
          lng: 38.751,
          address: 'Kirkos Sub-City, Addis Ababa'
        },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.admin.location.address).toBe('Kirkos Sub-City, Addis Ababa');

      const saved = await Admin.findOne({ email: 'address.validate@legash.org' });
      expect(saved.location.address).toBe('Kirkos Sub-City, Addis Ababa');
      const raw = await Admin.collection.findOne({ _id: saved._id });
      expect(raw.location.address).toBe('Kirkos Sub-City, Addis Ababa');
    });

    test('Rejects missing address in location with 400', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: addressToken,
        centerName: 'No Address Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751 },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/address is required/i);
    });

    test('Rejects address with 2 characters (< 3 chars) with 400', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: addressToken,
        centerName: 'Short Address Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: {
          lat: 9.015,
          lng: 38.751,
          address: 'AA'
        },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/address is required and must be between 3 and 200 characters/i);
    });

    test('Rejects address longer than 200 characters (201 chars) with 400', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: addressToken,
        centerName: 'Long Address Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: {
          lat: 9.015,
          lng: 38.751,
          address: 'X'.repeat(201)
        },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/address is required and must be between 3 and 200 characters/i);
    });

    test('Rejects address provided without coordinates with 400', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: addressToken,
        centerName: 'No Coords Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: {
          address: 'Somewhere in Addis Ababa'
        },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/valid coordinates or lat\/lng/i);
    });
  });

  // 21. Location coordinates requirements (lat and lng required)
  describe('21. Location coordinates requirements (lat and lng required)', () => {
    let locToken;

    beforeEach(async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'coords.req@legash.org' });

      const admin = await Admin.findOne({ email: 'coords.req@legash.org' });
      locToken = admin.setupToken;
    });

    test('Rejects location without lat', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: locToken,
        centerName: 'Missing Lat Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/valid coordinates or lat\/lng/i);
    });

    test('Rejects location without lng', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: locToken,
        centerName: 'Missing Lng Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, address: 'Stadium Area' },
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/valid coordinates or lat\/lng/i);
    });
  });

  // 22. Geospatial index (2dsphere) and raw MongoDB checks
  test('22. Geospatial $near query finds Admin with location and does not error on Admins without location', async () => {
    // 22a. Legacy admin with no location
    const legacyAdmin = await Admin.create({
      name: 'Legacy Center No Location',
      email: 'legacy.noloc@legash.org',
      passwordHash: await hashPassword('LegacyPassword123!'),
      emailVerified: true,
      permissions: { canApproveHospitals: true, canPostEvents: false }
    });

    // 22b. Admin with location via setup
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'geo.center@legash.org' });

    const invited = await Admin.findOne({ email: 'geo.center@legash.org' });
    await request(app).post('/api/auth/admin/setup').send({
      token: invited.setupToken,
      centerName: 'Addis Stadium Blood Center',
      phone: '+251115510000',
      password: 'Password123!',
      location: { lat: 9.0152, lng: 38.7512, address: 'Near Stadium' },
      termsAccepted: true
    });

    const activeAdmin = await Admin.findOne({ email: 'geo.center@legash.org' });

    // Verify raw MongoDB document structures
    const rawLegacy = await Admin.collection.findOne({ _id: legacyAdmin._id });
    expect(rawLegacy.location).toBeUndefined();

    const rawActive = await Admin.collection.findOne({ _id: activeAdmin._id });
    expect(rawActive.location).toBeDefined();
    expect(rawActive.location.type).toBe('Point');
    expect(rawActive.location.coordinates).toEqual([38.7512, 9.0152]);
    expect(rawActive.location.address).toBe('Near Stadium');

    // Perform $near query near the active center's coordinates
    const nearby = await Admin.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [38.751, 9.015]
          },
          $maxDistance: 5000 // 5 km
        }
      }
    });

    expect(nearby.length).toBe(1);
    expect(nearby[0]._id.toString()).toBe(activeAdmin._id.toString());
  });

  // 23. Pending invited Admin login rejection returns HTTP 401 JSON error, not 500
  test('23. Invited Admin with pending setup (passwordHash: null) gets 401 JSON error on login, never 500', async () => {
    await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ email: 'pending.login@legash.org' });

    const admin = await Admin.findOne({ email: 'pending.login@legash.org' });
    expect(admin.passwordHash).toBeNull();

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'pending.login@legash.org',
      password: 'AnyPasswordAttempt123!'
    });

    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.body.success).toBe(false);
    expect(loginRes.body.error).toBe('Invalid email or password.');
  });

  // 24. forgotPassword guards: pending Admin sends no email and preserves setupToken; registered Admin gets 6-digit reset code
  describe('24. forgotPassword guards for pending vs registered Admins', () => {
    test('forgotPassword for pending Admin sends no email and leaves setupToken unchanged', async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'pending.forgot@legash.org' });

      const pendingAdmin = await Admin.findOne({ email: 'pending.forgot@legash.org' });
      const originalSetupToken = pendingAdmin.setupToken;
      expect(originalSetupToken).toMatch(/^[0-9a-f]{64}$/);

      const sendResetEmailSpy = jest
        .spyOn(emailService, 'sendPasswordResetEmail')
        .mockResolvedValue({ success: true });

      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'pending.forgot@legash.org'
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/if an account exists/i);

      // Verify DB: setupToken is unchanged and no email dispatched
      const afterAdmin = await Admin.findOne({ email: 'pending.forgot@legash.org' });
      expect(afterAdmin.setupToken).toBe(originalSetupToken);
      expect(sendResetEmailSpy).not.toHaveBeenCalled();

      sendResetEmailSpy.mockRestore();
    });

    test('forgotPassword for registered Admin still emails a 6-digit code', async () => {
      // 1. Invite and register admin
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'registered.forgot@legash.org' });

      const invited = await Admin.findOne({ email: 'registered.forgot@legash.org' });
      await request(app).post('/api/auth/admin/setup').send({
        token: invited.setupToken,
        centerName: 'Registered Forgot Center',
        phone: '+251115510000',
        password: 'Password123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      const sendResetEmailSpy = jest
        .spyOn(emailService, 'sendPasswordResetEmail')
        .mockResolvedValue({ success: true });

      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'registered.forgot@legash.org'
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const registeredAdmin = await Admin.findOne({ email: 'registered.forgot@legash.org' });
      expect(registeredAdmin.setupToken).toMatch(/^\d{6}$/);
      expect(sendResetEmailSpy).toHaveBeenCalledWith(
        'registered.forgot@legash.org',
        registeredAdmin.setupToken
      );

      sendResetEmailSpy.mockRestore();
    });
  });

  // 25. resetPassword guards: works for registered Admin and is rejected for pending Admin
  describe('25. resetPassword guards for registered vs pending Admins', () => {
    test('resetPassword works for registered Admin with reset code', async () => {
      // 1. Create and setup registered admin
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'registered.reset@legash.org' });

      const invited = await Admin.findOne({ email: 'registered.reset@legash.org' });
      await request(app).post('/api/auth/admin/setup').send({
        token: invited.setupToken,
        centerName: 'Registered Reset Center',
        phone: '+251115510000',
        password: 'InitialPassword123!',
        location: { lat: 9.015, lng: 38.751, address: 'Stadium Area' },
        termsAccepted: true
      });

      // 2. Trigger forgot password
      await request(app).post('/api/auth/forgot-password').send({
        email: 'registered.reset@legash.org'
      });
      const registeredAdmin = await Admin.findOne({ email: 'registered.reset@legash.org' });
      const resetCode = registeredAdmin.setupToken;

      // 3. Reset password
      const resetRes = await request(app).post('/api/auth/reset-password').send({
        email: 'registered.reset@legash.org',
        code: resetCode,
        newPassword: 'BrandNewPassword123!'
      });

      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.message).toMatch(/password reset successful/i);

      // 4. Verify login with new password succeeds
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'registered.reset@legash.org',
        password: 'BrandNewPassword123!'
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.success).toBe(true);
    });

    test('resetPassword is rejected for pending Admin attempting to bypass registration', async () => {
      await request(app)
        .post('/api/superadmin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'pending.reset@legash.org' });

      const pendingAdmin = await Admin.findOne({ email: 'pending.reset@legash.org' });
      const inviteToken = pendingAdmin.setupToken;

      // Attempt to reset password using invitation setupToken without completing registration
      const resetRes = await request(app).post('/api/auth/reset-password').send({
        email: 'pending.reset@legash.org',
        code: inviteToken,
        newPassword: 'BypassPassword123!'
      });

      expect(resetRes.statusCode).toBe(400);
      expect(resetRes.body.success).toBe(false);
      expect(resetRes.body.error).toMatch(/invalid or expired reset code/i);

      // Verify DB: passwordHash remains null
      const adminAfter = await Admin.findOne({ email: 'pending.reset@legash.org' });
      expect(adminAfter.passwordHash).toBeNull();
    });
  });
});
