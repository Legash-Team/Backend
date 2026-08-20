const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');

const hospitalAuthRoutes = require('../../src/routes/hospitalAuthRoutes');
const sharedAuthRoutes = require('../../src/routes/sharedAuthRoutes');
const superAdminRoutes = require('../../src/routes/superAdminRoutes');
const feedbackRoutes = require('../../src/routes/feedbackRoutes');
const eventRoutes = require('../../src/routes/eventRoutes');
const errorHandler = require('../../src/middleware/errorHandler');

const Hospital = require('../../src/models/Hospital');
const SuperAdmin = require('../../src/models/SuperAdmin');
const AdminUser = require('../../src/models/AdminUser');
const Feedback = require('../../src/models/Feedback');
const EventPost = require('../../src/models/EventPost');

const generateToken = require('../../src/utils/generateToken');
const { hashPassword } = require('../../src/utils/hashPassword');

// Setup Express Test App
const app = express();
app.use(express.json());

app.use('/api/hospital', hospitalAuthRoutes);
app.use('/api/hospitals', hospitalAuthRoutes);
app.use('/api/auth', sharedAuthRoutes);
app.use('/api/admin', superAdminRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/events', eventRoutes);
app.use(errorHandler);

describe('Sprint 3: Complete Platform Flow & Lifecycle Integration Tests', () => {
  let superAdmin, superAdminToken;

  beforeEach(async () => {
    await Hospital.deleteMany({});
    await SuperAdmin.deleteMany({});
    await AdminUser.deleteMany({});
    await Feedback.deleteMany({});
    await EventPost.deleteMany({});

    // Seed test SuperAdmin
    superAdmin = await SuperAdmin.create({
      name: 'System Admin',
      email: 'admin@legash.org',
      passwordHash: await hashPassword('SuperAdmin123!'),
    });

    superAdminToken = generateToken({ id: superAdmin._id, role: 'superadmin' });
  });

  // =========================================================================
  // 1. HOSPITAL ONBOARDING, DUPLICATES & APPROVAL LIFECYCLE
  // =========================================================================
  describe('1. Hospital Registration, Duplicate Checks & Verification Lifecycle', () => {
    const validHospitalData = {
      name: 'St. Paul Millennium Hospital',
      email: 'contact@stpaul.edu.et',
      password: 'StrongPassword123!',
      phone: '+251911223344',
      licenseNumber: 'HOSP-ETH-789',
      location: {
        coordinates: [38.75, 9.03],
        address: 'Addis Ababa, Ethiopia',
      },
    };

    it('1.1 Should register a hospital successfully (201 Created)', async () => {
      const res = await request(app)
        .post('/api/hospitals/register')
        .send(validHospitalData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('hospitalId');
      expect(res.body.message).toMatch(/verify your email/i);
    });

    it('1.2 Should reject duplicate registration with same EMAIL (409 Conflict)', async () => {
      await request(app).post('/api/hospitals/register').send(validHospitalData);

      const res = await request(app)
        .post('/api/hospitals/register')
        .send({
          ...validHospitalData,
          phone: '+251911999999',
          licenseNumber: 'HOSP-DIFF-001',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/email is already registered/i);
    });

    it('1.3 Should reject duplicate registration with same PHONE (409 Conflict)', async () => {
      await request(app).post('/api/hospitals/register').send(validHospitalData);

      const res = await request(app)
        .post('/api/hospitals/register')
        .send({
          ...validHospitalData,
          email: 'different@stpaul.edu.et',
          licenseNumber: 'HOSP-DIFF-002',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/phone number is already registered/i);
    });

    it('1.4 Should reject duplicate registration with same LICENSE NUMBER (409 Conflict)', async () => {
      await request(app).post('/api/hospitals/register').send(validHospitalData);

      const res = await request(app)
        .post('/api/hospitals/register')
        .send({
          ...validHospitalData,
          email: 'another@stpaul.edu.et',
          phone: '+251911888888',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/license number is already registered/i);
    });

    it('1.5 Should verify email and set status to pending (not approved yet)', async () => {
      const regRes = await request(app)
        .post('/api/hospitals/register')
        .send(validHospitalData);

      const hospitalId = regRes.body.hospitalId;

      const verifyRes = await request(app)
        .get(`/api/hospitals/verify-email/${hospitalId}`);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      const hospitalInDb = await Hospital.findById(hospitalId);
      expect(hospitalInDb.emailVerified).toBe(true);
      expect(hospitalInDb.verificationStatus).toBe('pending');
    });

    it('1.6 Should block login when email is verified but Super Admin approval is still pending (401)', async () => {
      const regRes = await request(app)
        .post('/api/hospitals/register')
        .send(validHospitalData);

      await request(app).get(`/api/hospitals/verify-email/${regRes.body.hospitalId}`);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: validHospitalData.email,
          password: validHospitalData.password,
        });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.success).toBe(false);
      expect(loginRes.body.error).toMatch(/pending Super Admin approval/i);
    });
  });

  // =========================================================================
  // 2. SUPER ADMIN APPROVAL, REJECTION & HOSPITAL LOGIN WORKFLOW
  // =========================================================================
  describe('2. Super Admin Approval, Rejection with Reason & Login', () => {
    let hospitalA, hospitalB;

    beforeEach(async () => {
      hospitalA = await Hospital.create({
        hospitalName: 'Hospital Alpha',
        email: 'alpha@hospital.org',
        passwordHash: await hashPassword('AlphaPass123!'),
        phone: '+251911000001',
        licenseNumber: 'LIC-ALPHA-01',
        location: { type: 'Point', coordinates: [38.75, 9.03] },
        emailVerified: true,
        verificationStatus: 'pending',
      });

      hospitalB = await Hospital.create({
        hospitalName: 'Hospital Beta',
        email: 'beta@hospital.org',
        passwordHash: await hashPassword('BetaPass123!'),
        phone: '+251911000002',
        licenseNumber: 'LIC-BETA-02',
        location: { type: 'Point', coordinates: [38.75, 9.03] },
        emailVerified: true,
        verificationStatus: 'pending',
      });
    });

    it('2.1 Should list all pending hospitals with verified emails', async () => {
      const res = await request(app)
        .get('/api/admin/pending-hospitals')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hospitals.length).toBe(2);
      expect(res.body.hospitals.map((h) => h.email)).toEqual(
        expect.arrayContaining(['alpha@hospital.org', 'beta@hospital.org'])
      );
    });

    it('2.2 Should approve Hospital Alpha and allow login with JWT', async () => {
      // 1. Approve
      const approveRes = await request(app)
        .post(`/api/admin/hospitals/${hospitalA._id}/approve`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);

      const dbHospital = await Hospital.findById(hospitalA._id);
      expect(dbHospital.verificationStatus).toBe('approved');

      // 2. Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alpha@hospital.org',
          password: 'AlphaPass123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.role).toBe('hospital');
      expect(loginRes.body).toHaveProperty('token');
      expect(loginRes.body.user.email).toBe('alpha@hospital.org');
    });

    it('2.3 Should reject Hospital Beta with custom reason and prevent login', async () => {
      const rejectReason = 'Medical facility license expired on June 2026.';

      // 1. Reject with reason
      const rejectRes = await request(app)
        .post(`/api/admin/hospitals/${hospitalB._id}/reject`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: rejectReason });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.success).toBe(true);

      const dbHospital = await Hospital.findById(hospitalB._id);
      expect(dbHospital.verificationStatus).toBe('rejected');
      expect(dbHospital.rejectionReason).toBe(rejectReason);

      // 2. Attempt login (Should fail)
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'beta@hospital.org',
          password: 'BetaPass123!',
        });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.success).toBe(false);
      expect(loginRes.body.error).toMatch(/registration was not approved/i);
    });
  });

  // =========================================================================
  // 3. HOSPITAL APPEAL & FEEDBACK INGESTION
  // =========================================================================
  describe('3. Hospital Rejection Feedback & Appeal Flow', () => {
    it('3.1 Should submit public appeal feedback and allow SuperAdmin to view it', async () => {
      // 1. Submit public appeal
      const submitRes = await request(app)
        .post('/api/feedback/submit')
        .send({
          email: 'beta@hospital.org',
          hospitalName: 'Hospital Beta',
          subject: 'Appeal regarding license document',
          message: 'We have updated our license documents with MOH renewal receipt.',
        });

      expect(submitRes.status).toBe(201);
      expect(submitRes.body.success).toBe(true);
      expect(submitRes.body.data.hospitalEmail).toBe('beta@hospital.org');

      // 2. SuperAdmin fetches feedback list
      const listRes = await request(app)
        .get('/api/admin/feedbacks')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].hospitalEmail).toBe('beta@hospital.org');
      expect(listRes.body.data[0].message).toContain('updated our license');
    });
  });

  // =========================================================================
  // 4. EVENTS POSTING & DYNAMIC PUBLIC FEED
  // =========================================================================
  describe('4. Events Management & Dynamic Feed', () => {
    it('4.1 Should create an event and compute dynamic isOpen status in public feed', async () => {
      const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      // 1. Create Event
      const createRes = await request(app)
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          title: 'AAU Blood Drive 2026',
          description: 'University mobile donation drive.',
          mediaUrl: 'https://example.com/banner.jpg',
          mediaType: 'image',
          applicationLink: 'https://forms.gle/drive',
          closesAt: futureDate,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);

      const eventId = createRes.body.data._id;

      // 2. Public Event Feed (Dynamic isOpen === true)
      const feedRes = await request(app).get('/api/events');

      expect(feedRes.status).toBe(200);
      expect(feedRes.body.success).toBe(true);
      expect(feedRes.body.data.length).toBe(1);
      expect(feedRes.body.data[0].title).toBe('AAU Blood Drive 2026');
      expect(feedRes.body.data[0].isOpen).toBe(true);

      // 3. Admin Event List
      const adminListRes = await request(app)
        .get('/api/admin/events')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(adminListRes.status).toBe(200);
      expect(adminListRes.body.data.length).toBe(1);

      // 4. Delete Event
      const delRes = await request(app)
        .delete(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      const countAfter = await EventPost.countDocuments();
      expect(countAfter).toBe(0);
    });
  });

  // =========================================================================
  // 5. SUB-ADMIN RBAC CREATION, INVITATION & LOGIN
  // =========================================================================
  describe('5. Sub-Admin RBAC Lifecycle', () => {
    it('5.1 Should invite sub-admin, list them, activate account, and log in with assigned role', async () => {
      // 1. SuperAdmin invites Sub-Admin
      const inviteRes = await request(app)
        .post('/api/admin/create-subadmin')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Abebe Staff Admin',
          email: 'abebe@legash.org',
          role: 'can_approve_hospitals',
        });

      expect(inviteRes.status).toBe(201);
      expect(inviteRes.body.success).toBe(true);
      expect(inviteRes.body).toHaveProperty('invitationToken');

      const invitationToken = inviteRes.body.invitationToken;

      // 2. SuperAdmin checks Sub-Admin list
      const listRes = await request(app)
        .get('/api/admin/sub-admins')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.subAdmins.length).toBe(1);
      expect(listRes.body.subAdmins[0].email).toBe('abebe@legash.org');
      expect(listRes.body.subAdmins[0].permissions).toContain('can_approve_hospitals');

      // 3. Sub-Admin sets password via invitation token
      const acceptRes = await request(app)
        .post('/api/admin/accept-invitation')
        .send({
          token: invitationToken,
          password: 'StaffPassword123!',
        });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.success).toBe(true);

      // 4. Sub-Admin logs in through shared login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'abebe@legash.org',
          password: 'StaffPassword123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.role).toBe('admin');
      expect(loginRes.body).toHaveProperty('token');
      expect(loginRes.body.permissions).toContain('can_approve_hospitals');
      expect(loginRes.body.user.name).toBe('Abebe Staff Admin');
    });
  });
});