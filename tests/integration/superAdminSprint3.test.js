// Backend/tests/integration/superAdminSprint3.test.js
const request = require('supertest');
const app = require('../../server');
const Hospital = require('../../models/Hospital');
const SuperAdmin = require('../../models/SuperAdmin');
const Admin = require('../../models/Admin');
const Event = require('../../models/Event');
const Feedback = require('../../models/Feedback');
const { hashPassword } = require('../../utils/hashPassword');
const generateToken = require('../../utils/generateToken');

describe('Sprint 3 Super Admin, Feedback, Events, and Admin RBAC', () => {
  let superAdminToken = '';
  let superAdminId = '';
  let pendingHospitalId = '';

  beforeEach(async () => {
    const passwordHash = await hashPassword('SuperAdminPass123!');
    const superAdmin = await SuperAdmin.create({
      name: 'Main Super Admin',
      email: 'superadmin@legash.et',
      passwordHash,
    });
    superAdminId = superAdmin._id.toString();
    superAdminToken = generateToken({ id: superAdminId, role: 'superadmin' });

    const hospPasswordHash = await hashPassword('HospitalPass123!');
    const hospital = await Hospital.create({
      hospitalName: 'Tikur Anbessa Hospital',
      email: 'tikur@example.com',
      passwordHash: hospPasswordHash,
      phone: '+251911122334',
      licenseNumber: 'LIC-TIKUR-001',
      location: { type: 'Point', coordinates: [38.75, 9.03] },
      emailVerified: true,
      verificationStatus: 'pending',
    });
    pendingHospitalId = hospital._id.toString();
  });

  it('1. Rejects hospital requiring a reason, persists reason, and blocks login', async () => {
    // Missing reason rejection fails
    const failRes = await request(app)
      .post(`/api/superadmin/hospitals/${pendingHospitalId}/reject`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({});

    expect(failRes.status).toBe(400);
    expect(failRes.body.error).toBe('A rejection reason is required.');

    // Valid rejection succeeds
    const rejectRes = await request(app)
      .post(`/api/superadmin/hospitals/${pendingHospitalId}/reject`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ reason: 'License document was expired.' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);

    const hospitalDoc = await Hospital.findById(pendingHospitalId);
    expect(hospitalDoc.verificationStatus).toBe('rejected');
    expect(hospitalDoc.rejectionReason).toBe('License document was expired.');

    // Attempting login as rejected hospital fails with contract message
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'tikur@example.com',
        password: 'HospitalPass123!',
      });

    expect(loginRes.status).toBe(401);
    expect(loginRes.body.error).toBe('Your registration was not approved. Check your email for details.');
  });

  it('2. Public feedback submission by rejected hospital appears on Super Admin dashboard', async () => {
    // 1. Hospital submits feedback via public endpoint
    const feedbackRes = await request(app)
      .post('/api/hospital/feedback')
      .send({
        email: 'tikur@example.com',
        hospitalName: 'Tikur Anbessa Hospital',
        message: 'We have renewed our license, please review attached appeal.',
      });

    expect(feedbackRes.status).toBe(201);
    expect(feedbackRes.body.success).toBe(true);
    const feedbackId = feedbackRes.body.feedback._id;

    // 2. Super Admin views feedback
    const listRes = await request(app)
      .get('/api/superadmin/feedbacks')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.feedbacks.length).toBe(1);
    expect(listRes.body.feedbacks[0].message).toContain('renewed our license');

    // 3. Mark feedback reviewed
    const reviewRes = await request(app)
      .patch(`/api/superadmin/feedbacks/${feedbackId}/reviewed`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.feedback.status).toBe('reviewed');
  });

  it('3. Event Creation and Donor Event Feed isolation', async () => {
    const futureClose = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app)
      .post('/api/superadmin/events')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        mediaUrl: 'https://example.com/blood-drive.jpg',
        mediaType: 'image',
        description: 'Annual National Blood Donation Drive',
        applyLink: 'https://example.com/apply',
        closesAt: futureClose,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);

    // Mock donor token
    const donorToken = generateToken({ id: '507f1f77bcf86cd799439011', role: 'donor' });

    // Donor views events feed
    const donorEventsRes = await request(app)
      .get('/api/donor/events')
      .set('Authorization', `Bearer ${donorToken}`);

    expect(donorEventsRes.status).toBe(200);
    expect(donorEventsRes.body.events.length).toBe(1);
    expect(donorEventsRes.body.events[0].description).toBe('Annual National Blood Donation Drive');
    expect(donorEventsRes.body.events[0].status).toBe('open');
  });

  it('4. Admin Creation, Setup Password & Scoped Permission RBAC Enforcement', async () => {
    // 1. Super Admin creates Admin with approve-only permission
    const createAdminRes = await request(app)
      .post('/api/superadmin/admins')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Approver Admin',
        email: 'approver@legash.et',
        permissions: {
          canApproveHospitals: true,
          canPostEvents: false,
        },
      });

    expect(createAdminRes.status).toBe(201);
    expect(createAdminRes.body.admin.permissions.canApproveHospitals).toBe(true);

    const adminDoc = await Admin.findOne({ email: 'approver@legash.et' });
    expect(adminDoc.setupToken).toBeDefined();

    // 2. Admin sets password
    const setupRes = await request(app)
      .post('/api/superadmin/setup-password')
      .send({
        token: adminDoc.setupToken,
        password: 'AdminPassword123!',
        confirmPassword: 'AdminPassword123!',
      });

    expect(setupRes.status).toBe(200);

    // 3. Admin logs in via shared login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'approver@legash.et',
        password: 'AdminPassword123!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.role).toBe('admin');
    expect(loginRes.body.permissions.canApproveHospitals).toBe(true);

    const adminToken = loginRes.body.token;

    // 4. Admin CAN approve pending hospital
    const approveRes = await request(app)
      .post(`/api/superadmin/hospitals/${pendingHospitalId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.message).toContain('approved');

    // 5. Admin CANNOT post events (permission denied with 403)
    const eventPostFail = await request(app)
      .post('/api/superadmin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Unauthorized event',
        closesAt: new Date(Date.now() + 100000).toISOString(),
      });

    expect(eventPostFail.status).toBe(403);
    expect(eventPostFail.body.error).toContain('canPostEvents');
  });
});