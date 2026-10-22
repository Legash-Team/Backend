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

    // Check database state: pending, no profile fields, no password
    const savedAdmin = await Admin.findOne({ email: 'invite.center@legash.org' });
    expect(savedAdmin).toBeDefined();
    expect(savedAdmin.emailVerified).toBe(false);
    expect(savedAdmin.passwordHash).toBeNull();
    expect(savedAdmin.centerName).toBeNull();
    expect(savedAdmin.phone).toBeNull();
    expect(savedAdmin.location).toBeUndefined();
    expect(savedAdmin.setupToken).toBeDefined();
    expect(savedAdmin.setupTokenExpiresAt).toBeDefined();
  });

  // 2. Existing permission defaults and supported permission combinations remain unchanged
  test('2. Existing permission defaults and supported permission combinations remain unchanged', async () => {
    // 2a. Omitted permissions default to false
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

  // 4. Invitation email/setup flow is triggered correctly without exposing the raw setup token in the API response
  test('4. Invitation email/setup flow is triggered correctly without exposing raw setup token in API response', async () => {
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

    // Verify background email service was called
    const savedAdmin = await Admin.findOne({ email: 'email.trigger@legash.org' });
    expect(sendSetupEmailSpy).toHaveBeenCalledWith(
      'email.trigger@legash.org',
      savedAdmin.setupToken,
      { canApproveHospitals: true, canPostEvents: false }
    );
    expect(sendOtpSpy).toHaveBeenCalledWith('email.trigger@legash.org', savedAdmin.verificationOtp);

    // Response must NOT contain secret tokens
    expect(res.body.setupToken).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    expect(res.body.admin.setupToken).toBeUndefined();
    expect(res.body.admin.verificationOtp).toBeUndefined();
    expect(res.body.admin.passwordHash).toBeUndefined();

    sendSetupEmailSpy.mockRestore();
    sendOtpSpy.mockRestore();
  });

  // 5. A valid invitation can complete registration with center name, phone, password, location, and terms acceptance
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
    expect(res.body.admin.location).toEqual({ lat: 9.015, lng: 38.751 });

    // Verify DB persistence
    const updatedAdmin = await Admin.findById(invitedAdmin._id);
    expect(updatedAdmin.centerName).toBe('Addis Ababa Central Blood Bank');
    expect(updatedAdmin.phone).toBe('+251115510000');
    expect(updatedAdmin.emailVerified).toBe(true);
    expect(updatedAdmin.termsAccepted).toBe(true);
    expect(updatedAdmin.location.type).toBe('Point');
    expect(updatedAdmin.location.coordinates).toEqual([38.751, 9.015]); // GeoJSON [lng, lat]
    expect(updatedAdmin.setupToken).toBeNull();
    expect(updatedAdmin.setupTokenExpiresAt).toBeNull();
  });

  // 6. Registration without a location succeeds if location is optional in the agreed registration contract
  test('6. Registration without a location succeeds when location is omitted', async () => {
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

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Admin.findById(invited._id);
    expect(updated.centerName).toBe('Regional Mobile Blood Center');
    expect(updated.location).toBeUndefined();
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
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/center name is required/i);
    });

    test('Rejects missing phone', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        centerName: 'Valid Blood Bank',
        password: 'Password123!',
        termsAccepted: true
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/phone number is required/i);
    });

    test('Rejects short password (< 8 chars)', async () => {
      const res = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        centerName: 'Valid Blood Bank',
        phone: '+251115510000',
        password: 'short',
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
        password: 'Password123!'
      });

      expect(resMissing.statusCode).toBe(400);
      expect(resMissing.body.error).toMatch(/terms of service/i);

      const resFalse = await request(app).post('/api/auth/admin/setup').send({
        token: testToken,
        centerName: 'Valid Blood Bank',
        phone: '+251115510000',
        password: 'Password123!',
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
        .send({ ...basePayload(), location: { lat: 91, lng: 38.7 } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between -90 and 90/i);
    });

    test('Rejects latitude < -90', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: -91, lng: 38.7 } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between -90 and 90/i);
    });

    test('Rejects longitude > 180', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 9.0, lng: 181 } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between -180 and 180/i);
    });

    test('Rejects longitude < -180', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 9.0, lng: -181 } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/between -180 and 180/i);
    });

    test('Rejects non-numeric latitude or longitude strings', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 'nine', lng: 38.7 } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/finite numbers/i);
    });

    test('Rejects incomplete location without lng', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: { lat: 9.0 } });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/valid coordinates or lat\/lng/i);
    });

    test('Rejects primitive string location', async () => {
      const res = await request(app)
        .post('/api/auth/admin/setup')
        .send({ ...basePayload(), location: 'Addis Ababa' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/object with coordinates/i);
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
        location: { lat: 9.02, lng: 38.74 },
        termsAccepted: true
      });

    expect(res.statusCode).toBe(200);

    const saved = await Admin.findById(admin._id);
    expect(saved.location.type).toBe('Point');
    // GeoJSON Point coordinates format: [lng, lat]
    expect(saved.location.coordinates[0]).toBe(38.74); // Longitude
    expect(saved.location.coordinates[1]).toBe(9.02); // Latitude
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
      termsAccepted: true
    });
    expect(firstUseRes.statusCode).toBe(200);

    // Second use: fails because token was cleared
    const secondUseRes = await request(app).post('/api/auth/admin/setup').send({
      token: tokenToReuse,
      centerName: 'Reused Center',
      phone: '+251115510000',
      password: 'Password123!',
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

    await request(app).post('/api/auth/admin/setup').send({
      token: admin.setupToken,
      centerName: 'Bole Regional Blood Bank',
      phone: '+251115510000',
      password: 'BloodCenterPass123!',
      termsAccepted: true
    });

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
});
