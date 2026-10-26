const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

const hospitalRoutes = require('../../src/routes/hospitalRoutes');
const bloodRequestRoutes = require('../../src/routes/bloodRequestRoutes');
const donorAuthRoutes = require('../../src/routes/donorAuthRoutes');
const donorNotificationRoutes = require('../../src/routes/donorNotificationRoutes');
const superAdminRoutes = require('../../src/routes/superAdminRoutes');
const sharedAuthRoutes = require('../../src/routes/sharedAuthRoutes');
const eventRoutes = require('../../src/routes/eventRoutes');
const { mounts: adminEventMounts } = require('../../src/routes/v2/adminEventRoutes');
const { mounts: bloodCenterProfileMounts } = require('../../src/routes/v2/bloodCenterProfileRoutes');
const { mounts: donationRecordMounts } = require('../../src/routes/v2/donationRecordRoutes');

const errorHandler = require('../../src/middleware/errorHandler');
const Hospital = require('../../src/models/Hospital');
const Admin = require('../../src/models/Admin');
const SuperAdmin = require('../../src/models/SuperAdmin');
const Event = require('../../src/models/Event');
const Donor = require('../../src/models/Donor');
const BloodRequest = require('../../src/models/BloodRequest');
const BloodRequestResponse = require('../../src/models/BloodRequestResponse');
const DonationRecord = require('../../src/models/DonationRecord');

const generateToken = require('../../src/utils/generateToken');
const { hashPassword } = require('../../src/utils/hashPassword');

const app = express();
app.use(express.json());
app.use('/api/hospital', hospitalRoutes);
app.use('/api/hospital/blood-requests', bloodRequestRoutes);
app.use('/api/donor', donorAuthRoutes);
app.use('/api/donor/notifications', donorNotificationRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/auth', sharedAuthRoutes);
app.use('/api/donor/events', eventRoutes);

for (const m of adminEventMounts) {
  app.use(m.path, m.router);
}
for (const m of bloodCenterProfileMounts) {
  app.use(m.path, m.router);
}
for (const m of donationRecordMounts) {
  app.use(m.path, m.router);
}

app.use(errorHandler);

describe('Additional Requirements Integration Tests', () => {
  let superAdminToken;
  let hospitalToken;
  let hospitalA;
  let hospitalB;

  beforeEach(async () => {
    await Hospital.deleteMany({});
    await Admin.deleteMany({});
    await SuperAdmin.deleteMany({});
    await Event.deleteMany({});
    await Donor.deleteMany({});
    await BloodRequest.deleteMany({});
    await BloodRequestResponse.deleteMany({});
    await DonationRecord.deleteMany({});

    const passwordHash = await hashPassword('Secret123!');

    // Create SuperAdmin
    const sa = await SuperAdmin.create({
      name: 'Super Admin',
      email: 'sa@legash.org',
      passwordHash,
    });
    superAdminToken = generateToken({ id: sa._id.toString(), role: 'superadmin' });

    // Create Hospital A
    hospitalA = await Hospital.create({
      hospitalName: 'St. Paul Hospital',
      email: 'stpaul@hospital.com',
      phone: '+251911000001',
      licenseNumber: 'LIC-STPAUL-999',
      verificationStatus: 'approved',
      emailVerified: true,
      passwordHash,
      location: {
        type: 'Point',
        coordinates: [38.75, 9.03],
        address: 'Swaziland St, Addis Ababa',
      },
      bloodStock: [{ bloodType: 'A+', availableUnits: 10, totalUnits: 10 }],
    });
    hospitalToken = generateToken({ id: hospitalA._id.toString(), role: 'hospital' });

    // Create Hospital B
    hospitalB = await Hospital.create({
      hospitalName: 'Black Lion Hospital',
      email: 'blacklion@hospital.com',
      phone: '+251911000002',
      licenseNumber: 'LIC-BLACKLION-888',
      verificationStatus: 'approved',
      emailVerified: true,
      passwordHash,
      location: {
        type: 'Point',
        coordinates: [38.74, 9.02],
        address: 'Tikur Anbessa, Addis Ababa',
      },
      bloodStock: [{ bloodType: 'A+', availableUnits: 5, totalUnits: 5 }],
    });
  });

  // --- REQUIREMENT 1: Hospital Search Privacy ---
  describe('1. Hospital Search Privacy', () => {
    test('Hospitals viewing search results do not see other hospital license numbers', async () => {
      const res = await request(app)
        .get('/api/hospital/search?bloodType=A%2B&quantity=1')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);

      const target = res.body.results.find((h) => h.id === hospitalB._id.toString());
      expect(target).toBeDefined();
      expect(target.name).toBe('Black Lion Hospital');
      // License number must NOT be exposed to hospitals searching other hospitals
      expect(target.licenseNumber).toBeUndefined();
    });

    test('Preserves license information in authorized profile and administrative verification workflows', async () => {
      // 1. Authorized hospital profile workflow
      const profileRes = await request(app)
        .get('/api/hospital/profile')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.profile.licenseNumber).toBe('LIC-STPAUL-999');

      // 2. Authorized superadmin verification workflow
      const pendingHospital = await Hospital.create({
        hospitalName: 'Pending General Hospital',
        email: 'pending@hospital.com',
        phone: '+251911333333',
        licenseNumber: 'LIC-PENDING-777',
        verificationStatus: 'pending',
        emailVerified: true,
        passwordHash: 'secret',
        location: {
          type: 'Point',
          coordinates: [38.74, 9.01],
          address: 'Bole, Addis Ababa',
        },
      });

      const pendingRes = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(pendingRes.status).toBe(200);
      const found = pendingRes.body.hospitals.find((h) => h.id === pendingHospital._id.toString());
      expect(found).toBeDefined();
      expect(found.licenseNumber).toBe('LIC-PENDING-777');
    });
  });

  // --- REQUIREMENT 3: Admin Access & Permission Grant/Revoke ---
  describe('3. Admin Access to Hospitals and Feedback & Grant/Revoke', () => {
    test('Admin with canApproveHospitals can access pending hospitals and feedbacks', async () => {
      const passwordHash = await hashPassword('AdminPass123!');
      const admin = await Admin.create({
        name: 'Staff Admin',
        email: 'staff@legash.org',
        passwordHash,
        emailVerified: true,
        permissions: { canApproveHospitals: true, canPostEvents: false },
      });
      const adminToken = generateToken({ id: admin._id.toString(), role: 'admin' });

      const pendingRes = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(pendingRes.status).toBe(200);

      const feedbackRes = await request(app)
        .get('/api/superadmin/feedbacks')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(feedbackRes.status).toBe(200);
    });

    test('Admin without canApproveHospitals is rejected with 403', async () => {
      const passwordHash = await hashPassword('AdminPass123!');
      const admin = await Admin.create({
        name: 'Restricted Staff',
        email: 'restricted@legash.org',
        passwordHash,
        emailVerified: true,
        permissions: { canApproveHospitals: false, canPostEvents: true },
      });
      const adminToken = generateToken({ id: admin._id.toString(), role: 'admin' });

      const pendingRes = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(pendingRes.status).toBe(403);

      const feedbackRes = await request(app)
        .get('/api/superadmin/feedbacks')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(feedbackRes.status).toBe(403);
    });

    test('Superadmin can dynamically grant and revoke permissions via PATCH /superadmin/admins/:id/permissions', async () => {
      const passwordHash = await hashPassword('AdminPass123!');
      const admin = await Admin.create({
        name: 'Dynamic Staff',
        email: 'dynamic@legash.org',
        passwordHash,
        emailVerified: true,
        permissions: { canApproveHospitals: false, canPostEvents: false },
      });
      const adminToken = generateToken({ id: admin._id.toString(), role: 'admin' });

      // Initially blocked
      let res = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);

      // Superadmin grants permission
      const grantRes = await request(app)
        .patch(`/api/superadmin/admins/${admin._id}/permissions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ permissions: { canApproveHospitals: true } });
      expect(grantRes.status).toBe(200);
      expect(grantRes.body.admin.permissions.canApproveHospitals).toBe(true);

      // Now permitted immediately
      res = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);

      // Superadmin revokes permission
      const revokeRes = await request(app)
        .patch(`/api/superadmin/admins/${admin._id}/permissions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ permissions: { canApproveHospitals: false } });
      expect(revokeRes.status).toBe(200);

      // Now blocked immediately
      res = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });
  });

  // --- REQUIREMENT 4 & 5: Closed Events & Donor Views ---
  describe('4 & 5. Closed Events Remain Visible and Labeled', () => {
    test('Closing an event persists status: closed and displays CLOSED label', async () => {
      const event = await Event.create({
        title: 'Community Blood Drive',
        description: 'Join us to donate blood!',
        closesAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Future date
        status: 'open',
      });

      // Close event
      const closeRes = await request(app)
        .patch(`/api/admin/events/${event._id}/close`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.event.status).toBe('closed');

      // Verify DB persistence (pre-save hook does NOT reset to open)
      const freshEvent = await Event.findById(event._id);
      expect(freshEvent.status).toBe('closed');

      // Create a donor to query public events
      const donor = await Donor.create({
        phone: '+251911777777',
        name: 'Event Viewer Donor',
        bloodType: 'B+',
        shortId: 'VIEWER01',
        fin: '112233445566',
        isVerified: true,
        location: {
          type: 'Point',
          coordinates: [38.75, 9.03],
          address: 'Addis Ababa',
        },
      });
      const donorToken = generateToken({ id: donor._id.toString(), role: 'donor' });

      // Donor public feed with ?status=closed returns it labeled closed
      const closedListRes = await request(app)
        .get('/api/donor/events?status=closed')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(closedListRes.status).toBe(200);
      const found = closedListRes.body.events.find((e) => e.id === event._id.toString());
      expect(found).toBeDefined();
      expect(found.status).toBe('closed');
    });
  });

  // --- REQUIREMENT 6: Blood Center Profile ---
  describe('6. Blood Center Profile', () => {
    test('Blood center can view and update profile and reload fresh data', async () => {
      const passwordHash = await hashPassword('CenterPass123!');
      const center = await Admin.create({
        name: 'National Blood Bank Staff',
        centerName: 'National Blood Bank of Ethiopia',
        email: 'nbb@ethiopia.org',
        phone: '+251115512244',
        passwordHash,
        emailVerified: true,
        location: {
          type: 'Point',
          coordinates: [38.76, 9.02],
          address: 'Stadium Area, Addis Ababa',
        },
      });
      const centerToken = generateToken({ id: center._id.toString(), role: 'admin' });

      // GET profile
      const getRes = await request(app)
        .get('/api/blood-center/profile')
        .set('Authorization', `Bearer ${centerToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.profile.centerName).toBe('National Blood Bank of Ethiopia');
      expect(getRes.body.profile.email).toBe('nbb@ethiopia.org');

      // PUT profile update
      const updateRes = await request(app)
        .put('/api/blood-center/profile')
        .set('Authorization', `Bearer ${centerToken}`)
        .send({
          centerName: 'National Blood Bank Center (Main HQ)',
          email: 'hq@nbb.org',
          phone: '+251115500000',
          location: {
            address: 'Mexico Square, Addis Ababa',
            lat: 9.015,
            lng: 38.745,
          },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.profile.centerName).toBe('National Blood Bank Center (Main HQ)');
      expect(updateRes.body.profile.email).toBe('hq@nbb.org');
      expect(updateRes.body.profile.location.address).toBe('Mexico Square, Addis Ababa');

      // Verify persisted in DB
      const freshCenter = await Admin.findById(center._id);
      expect(freshCenter.centerName).toBe('National Blood Bank Center (Main HQ)');
      expect(freshCenter.email).toBe('hq@nbb.org');
    });
  });

  // --- REQUIREMENT 8: Hospital Marks "Did Not Donate" ---
  describe('8. Hospital marks Did Not Donate', () => {
    test('Selecting did_not_donate does NOT create a donation record, updates queue, and does not alter cooldown', async () => {
      const donor = await Donor.create({
        phone: '+251911555555',
        name: 'Selam Tesfaye',
        bloodType: 'A+',
        shortId: 'SELAM001',
        fin: '998877665544',
        isVerified: true,
        lastDonatedAt: null,
        location: {
          type: 'Point',
          coordinates: [38.75, 9.03],
          address: 'Addis Ababa',
        },
      });

      const bloodRequest = await BloodRequest.create({
        hospital: hospitalA._id,
        bloodType: 'A+',
        quantityNeeded: 1,
        status: 'closed',
        closesAt: new Date(Date.now() - 10000),
      });

      const response = await BloodRequestResponse.create({
        bloodRequest: bloodRequest._id,
        donor: donor._id,
        status: 'accepted',
      });

      // Record outcome as "did_not_donate"
      const res = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: bloodRequest._id.toString(),
          bloodRequestResponseId: response._id.toString(),
          outcome: 'did_not_donate',
          donationDate: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.outcome).toBe('did_not_donate');

      // 1. Ensure NO donation record exists in database
      const recordsCount = await DonationRecord.countDocuments({ donor: donor._id });
      expect(recordsCount).toBe(0);

      const hospitalRecords = await DonationRecord.countDocuments({ hospital: hospitalA._id });
      expect(hospitalRecords).toBe(0);

      // 2. Ensure donor lastDonatedAt was NOT touched
      const freshDonor = await Donor.findById(donor._id);
      expect(freshDonor.lastDonatedAt).toBeNull();

      // 3. Ensure response is marked and removed from pending queue
      const queueRes = await request(app)
        .get('/api/hospital/donation-records/pending')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(queueRes.status).toBe(200);
      const inQueue = queueRes.body.find((q) => q.responseId === response._id.toString());
      expect(inQueue).toBeUndefined();

      // 4. Repeated retry does NOT create a record
      const retryRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: bloodRequest._id.toString(),
          bloodRequestResponseId: response._id.toString(),
          outcome: 'did_not_donate',
          donationDate: new Date().toISOString(),
        });

      expect(retryRes.status).toBe(200);
      const finalCount = await DonationRecord.countDocuments({ donor: donor._id });
      expect(finalCount).toBe(0);
    });
  });

  // --- REQUIREMENT 7: Newly registered donors and existing events ---
  describe('7. Newly registered donors and existing events', () => {
    test('Newly registered donor can see active events created before registration date', async () => {
      // Event created in the past (e.g. yesterday) but still open for 5 more days
      const activeEvent = await Event.create({
        title: 'Active Regional Drive',
        description: 'Open to all donors',
        closesAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        status: 'open',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Created yesterday
      });

      // Donor registers today
      const newDonor = await Donor.create({
        phone: '+251911999888',
        name: 'Brand New Donor',
        bloodType: 'O+',
        shortId: 'NEWDON01',
        fin: '123123123123',
        isVerified: true,
        createdAt: new Date(), // Registered today
        location: {
          type: 'Point',
          coordinates: [38.75, 9.03],
          address: 'Addis Ababa',
        },
      });
      const newDonorToken = generateToken({ id: newDonor._id.toString(), role: 'donor' });

      // Query public active events
      const res = await request(app)
        .get('/api/donor/events?status=active')
        .set('Authorization', `Bearer ${newDonorToken}`);

      expect(res.status).toBe(200);

      const found = res.body.events.find((e) => e.id === activeEvent._id.toString());
      expect(found).toBeDefined();
      expect(found.status).toBe('open');
    });
  });

  // --- REQUIREMENT 9: Hospital Dashboard Alert and Medical Records Waiting & Filled Tabs ---
  describe('9. Hospital Dashboard Alert and Medical Records Waiting & Filled Tabs', () => {
    test('Dashboard alert count and queue reflect actual pending donors, excluding missing donors and processed outcomes', async () => {
      // Create Donor 1, Donor 2, Donor 3
      const donor1 = await Donor.create({
        phone: '+251911111001',
        name: 'Abebe Bikila',
        bloodType: 'B+',
        shortId: 'ABEBE001',
        fin: '111111111111',
        isVerified: true,
        location: { type: 'Point', coordinates: [38.75, 9.03], address: 'Addis Ababa' },
      });

      const donor2 = await Donor.create({
        phone: '+251911111002',
        name: 'Derartu Tulu',
        bloodType: 'A+',
        shortId: 'DERARTU1',
        fin: '222222222222',
        isVerified: true,
        location: { type: 'Point', coordinates: [38.75, 9.03], address: 'Addis Ababa' },
      });

      const donor3 = await Donor.create({
        phone: '+251911111003',
        name: 'Deleted Donor',
        bloodType: 'O+',
        shortId: 'DELETED1',
        fin: '333333333333',
        isVerified: true,
        location: { type: 'Point', coordinates: [38.75, 9.03], address: 'Addis Ababa' },
      });

      // Request 1 is open; Request 2 is closed
      const req1 = await BloodRequest.create({
        hospital: hospitalA._id,
        bloodType: 'B+',
        quantityNeeded: 2,
        status: 'open',
        closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const req2 = await BloodRequest.create({
        hospital: hospitalA._id,
        bloodType: 'A+',
        quantityNeeded: 1,
        status: 'closed',
        closesAt: new Date(Date.now() - 10000),
      });

      // Responses
      const resp1 = await BloodRequestResponse.create({
        bloodRequest: req1._id,
        donor: donor1._id,
        status: 'accepted',
      });

      const resp2 = await BloodRequestResponse.create({
        bloodRequest: req2._id,
        donor: donor2._id,
        status: 'accepted',
      });

      const resp3 = await BloodRequestResponse.create({
        bloodRequest: req1._id,
        donor: donor3._id,
        status: 'accepted',
      });

      // Delete Donor 3 from database to simulate a deleted/missing donor
      await Donor.deleteOne({ _id: donor3._id });

      // 1. Verify pending count reflects actual pending donors and excludes missing donor
      const countRes = await request(app)
        .get('/api/hospital/donation-records/pending/count')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(countRes.status).toBe(200);
      expect(countRes.body.success).toBe(true);
      expect(countRes.body.count).toBe(2); // Only donor1 and donor2, donor3 is excluded

      // 2. Verify pending queue matches count and excludes missing donor
      const queueRes = await request(app)
        .get('/api/hospital/donation-records/pending')
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(queueRes.status).toBe(200);
      expect(queueRes.body.length).toBe(2);
      const queueIds = queueRes.body.map((q) => q.responseId);
      expect(queueIds).toContain(resp1._id.toString());
      expect(queueIds).toContain(resp2._id.toString());
      expect(queueIds).not.toContain(resp3._id.toString());

      // Queue items contain request and donor details for grouping
      const queueItem1 = queueRes.body.find((q) => q.responseId === resp1._id.toString());
      expect(queueItem1.name).toBe('Abebe Bikila');
      expect(queueItem1.bloodType).toBe('B+');
      expect(queueItem1.request).toBeDefined();
      expect(queueItem1.request.bloodType).toBe('B+');

      // 3. Hospital records outcome: "donated" for Donor 1 on open request
      const donateRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: req1._id.toString(),
          bloodRequestResponseId: resp1._id.toString(),
          outcome: 'donated',
          donorBloodType: 'B+',
          unitsCollected: 1,
          donationDate: new Date().toISOString(),
          recordedBy: 'Nurse Martha',
        });

      expect(donateRes.status).toBe(201);
      expect(donateRes.body.success).toBe(true);

      // Verify only 1 record created in database
      const donor1Records = await DonationRecord.find({ donor: donor1._id });
      expect(donor1Records.length).toBe(1);
      expect(donor1Records[0].outcome).toBe('donated');

      // Verify count drops to 1
      const countAfterDonate = await request(app)
        .get('/api/hospital/donation-records/pending/count')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(countAfterDonate.body.count).toBe(1);

      // Verify donor 1 is removed from queue
      const queueAfterDonate = await request(app)
        .get('/api/hospital/donation-records/pending')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(queueAfterDonate.body.length).toBe(1);
      expect(queueAfterDonate.body[0].responseId).toBe(resp2._id.toString());

      // Verify donor 1 appears in Filled tab records (listHospitalRecords)
      const recordsRes = await request(app)
        .get('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(recordsRes.status).toBe(200);
      const filledItem = recordsRes.body.records.find((r) => r.responseId === resp1._id.toString());
      expect(filledItem).toBeDefined();
      expect(filledItem.donorName).toBe('Abebe Bikila');
      expect(filledItem.outcome).toBe('donated');

      // Verify duplicate submission returns 409 Conflict
      const dupRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: req1._id.toString(),
          bloodRequestResponseId: resp1._id.toString(),
          outcome: 'donated',
          donorBloodType: 'B+',
          donationDate: new Date().toISOString(),
        });
      expect(dupRes.status).toBe(409);

      // 4. Hospital records outcome: "did_not_donate" for Donor 2
      const didNotDonateRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: req2._id.toString(),
          bloodRequestResponseId: resp2._id.toString(),
          outcome: 'did_not_donate',
          donationDate: new Date().toISOString(),
        });

      expect(didNotDonateRes.status).toBe(200);
      expect(didNotDonateRes.body.success).toBe(true);

      // Verify 0 donation records created anywhere for Donor 2
      const donor2Records = await DonationRecord.find({ donor: donor2._id });
      expect(donor2Records.length).toBe(0);

      // Verify donor 2 cooldown was NOT altered
      const freshDonor2 = await Donor.findById(donor2._id);
      expect(freshDonor2.lastDonatedAt).toBeNull();

      // Verify count drops to 0 (alert should hide completely)
      const countFinal = await request(app)
        .get('/api/hospital/donation-records/pending/count')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(countFinal.body.count).toBe(0);

      // Verify queue is completely empty
      const queueFinal = await request(app)
        .get('/api/hospital/donation-records/pending')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(queueFinal.body.length).toBe(0);

      // Verify "Did Not Donate" does NOT appear in Filled tab records
      const recordsFinal = await request(app)
        .get('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`);
      const donor2InFilled = recordsFinal.body.records.find(
        (r) => r.responseId === resp2._id.toString() || r.donorName === 'Derartu Tulu'
      );
      expect(donor2InFilled).toBeUndefined();

      // Verify attempt to switch outcome from did_not_donate to donated is rejected
      const switchRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: req2._id.toString(),
          bloodRequestResponseId: resp2._id.toString(),
          outcome: 'donated',
          donorBloodType: 'A+',
          donationDate: new Date().toISOString(),
        });
      expect(switchRes.status).toBe(400);
    });
  });

  describe('Fix 1: Blood Center Hospital-Approval Access', () => {
    it('enforces hospital-approval permission on blood center accounts and updates dynamically upon grant/revoke/reload', async () => {
      const passwordHash = await hashPassword('AdminPass123!');
      const bloodCenterAdmin = await Admin.create({
        name: 'Addis Blood Bank Admin',
        centerName: 'Addis Blood Bank',
        email: 'addis.bb@legash.org',
        passwordHash,
        emailVerified: true,
        permissions: {
          canApproveHospitals: false,
          canPostEvents: true,
        },
      });

      const bcToken = generateToken({
        id: bloodCenterAdmin._id.toString(),
        role: 'admin',
        centerName: 'Addis Blood Bank',
      });

      // 1. Without canApproveHospitals, accessing pending hospitals or feedbacks returns 403
      const unauthHospitals = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${bcToken}`);
      expect(unauthHospitals.status).toBe(403);

      const unauthFeedbacks = await request(app)
        .get('/api/superadmin/feedbacks')
        .set('Authorization', `Bearer ${bcToken}`);
      expect(unauthFeedbacks.status).toBe(403);

      // 2. Superadmin grants canApproveHospitals via PATCH /api/superadmin/admins/:id/permissions
      const grantRes = await request(app)
        .patch(`/api/superadmin/admins/${bloodCenterAdmin._id}/permissions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ canApproveHospitals: true });
      expect(grantRes.status).toBe(200);
      expect(grantRes.body.admin.permissions.canApproveHospitals).toBe(true);

      // 3. Blood center admin reloads session via GET /api/auth/me
      const reloadRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${bcToken}`);
      expect(reloadRes.status).toBe(200);
      expect(reloadRes.body.permissions.canApproveHospitals).toBe(true);

      // 4. Authorized blood center can now access pending hospitals and feedbacks
      const authHospitals = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${bcToken}`);
      expect(authHospitals.status).toBe(200);

      const authFeedbacks = await request(app)
        .get('/api/superadmin/feedbacks')
        .set('Authorization', `Bearer ${bcToken}`);
      expect(authFeedbacks.status).toBe(200);

      // 5. Blood center cannot access superadmin-only admin management routes
      const adminManageAttempt = await request(app)
        .get('/api/superadmin/admins')
        .set('Authorization', `Bearer ${bcToken}`);
      expect(adminManageAttempt.status).toBe(403);

      // 6. Superadmin revokes permission
      const revokeRes = await request(app)
        .patch(`/api/superadmin/admins/${bloodCenterAdmin._id}/permissions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ canApproveHospitals: false });
      expect(revokeRes.status).toBe(200);

      // 7. After reload, blood center permissions are revoked and access is blocked again
      const reloadRevoked = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${bcToken}`);
      expect(reloadRevoked.body.permissions.canApproveHospitals).toBe(false);

      const revokedHospitals = await request(app)
        .get('/api/superadmin/hospitals/pending')
        .set('Authorization', `Bearer ${bcToken}`);
      expect(revokedHospitals.status).toBe(403);
    });
  });

  describe('Fix 2: Blood Center Profile & Password Reset', () => {
    it('allows editing email and location, persists them, and initiates password reset flow', async () => {
      const passwordHash = await hashPassword('AdminPass123!');
      const bloodCenter = await Admin.create({
        name: 'Nazret Center',
        centerName: 'Nazret Blood Center',
        email: 'nazret@blood.org',
        passwordHash,
        emailVerified: true,
        location: {
          type: 'Point',
          coordinates: [39.28, 8.54],
          address: 'Old Highway, Nazret',
        },
      });

      const token = generateToken({
        id: bloodCenter._id.toString(),
        role: 'admin',
        centerName: 'Nazret Blood Center',
      });

      // 1. Update email and location via PUT /api/blood-center/profile
      const updateRes = await request(app)
        .put('/api/blood-center/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'nazret.updated@blood.org',
          location: {
            lat: 8.55,
            lng: 39.29,
            address: 'New Expressway, Nazret',
          },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.profile.email).toBe('nazret.updated@blood.org');
      expect(updateRes.body.profile.location.address).toBe('New Expressway, Nazret');
      expect(updateRes.body.profile.location.lat).toBe(8.55);
      expect(updateRes.body.profile.location.lng).toBe(39.29);

      // 2. Verify persistence on GET /api/blood-center/profile
      const getRes = await request(app)
        .get('/api/blood-center/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.profile.email).toBe('nazret.updated@blood.org');
      expect(getRes.body.profile.location.address).toBe('New Expressway, Nazret');

      // 3. Initiate password reset via POST /api/auth/forgot-password (reusing existing flow)
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nazret.updated@blood.org' });
      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.success).toBe(true);

      // Verify reset code was generated on the Admin record
      const freshAdmin = await Admin.findById(bloodCenter._id);
      expect(freshAdmin.setupToken).toBeDefined();
      expect(freshAdmin.setupTokenExpiresAt).toBeDefined();

      // 4. Complete reset password via POST /api/auth/reset-password
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'nazret.updated@blood.org',
          code: freshAdmin.setupToken,
          newPassword: 'BrandNewPassword123!',
        });
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);
    });
  });

  describe('Fix 3: Correct Donation Records, Statistics & Cooldown', () => {
    it('ensures request acceptance alone never updates stats or cooldown, and only successful donation updates stats and triggers 90-day cooldown', async () => {
      // 1. Create a donor
      const donor = await Donor.create({
        name: 'Haile Gebrselassie',
        phone: '+251911777777',
        fin: 'FIN-HAILE-001',
        shortId: 'HAILE001',
        bloodType: 'O+',
        lastDonatedAt: null,
        location: { type: 'Point', coordinates: [38.75, 9.03] },
      });
      const donorToken = generateToken({ id: donor._id.toString(), role: 'donor' });

      // Create a blood request from Hospital A
      const bloodReq = await BloodRequest.create({
        hospital: hospitalA._id,
        bloodType: 'O+',
        quantityNeeded: 2,
        closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const responseDoc = await BloodRequestResponse.create({
        bloodRequest: bloodReq._id,
        donor: donor._id,
        status: 'pending',
      });

      // 2. Donor accepts the request
      const acceptRes = await request(app)
        .post(`/api/donor/notifications/${responseDoc._id}/respond`)
        .set('Authorization', `Bearer ${donorToken}`)
        .send({ response: 'accepted' });
      expect(acceptRes.status).toBe(200);

      // Verify donor stats, cooldown, and lastDonatedAt remain UNTOUCHED after acceptance
      const postAcceptDonor = await Donor.findById(donor._id);
      expect(postAcceptDonor.lastDonatedAt).toBeNull();

      const donorHistoryAfterAccept = await request(app)
        .get('/api/donor/donation-history')
        .set('Authorization', `Bearer ${donorToken}`);
      expect(donorHistoryAfterAccept.status).toBe(200);
      expect(donorHistoryAfterAccept.body.donations.length).toBe(0);

      // 3. Hospital records successful donation
      const donationDate = new Date();
      const recordRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: bloodReq._id.toString(),
          bloodRequestResponseId: responseDoc._id.toString(),
          outcome: 'donated',
          donorBloodType: 'O+',
          donationDate: donationDate.toISOString(),
          unitsCollected: 1,
        });
      expect(recordRes.status).toBe(201);

      // 4. Now, and only now, donor stats and lastDonatedAt are updated
      const postDonationDonor = await Donor.findById(donor._id);
      expect(postDonationDonor.lastDonatedAt).toBeDefined();
      expect(new Date(postDonationDonor.lastDonatedAt).getTime()).toBeCloseTo(donationDate.getTime(), -3);

      const donorHistoryAfterDonate = await request(app)
        .get('/api/donor/donation-history')
        .set('Authorization', `Bearer ${donorToken}`);
      expect(donorHistoryAfterDonate.status).toBe(200);
      expect(donorHistoryAfterDonate.body.donations.length).toBe(1);
      expect(donorHistoryAfterDonate.body.donations[0].outcome).toBe('donated');

      // 5. Verify 90-day cooldown excludes donor from receiving new blood requests
      const newBloodReqRes = await request(app)
        .post('/api/hospital/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodType: 'O+',
          quantityNeeded: 1,
          closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(newBloodReqRes.status).toBe(201);
      // Notified count should be 0 because the donor is in 90-day cooldown
      expect(newBloodReqRes.body.notifiedDonorCount).toBe(0);
    });
  });

  describe('Fix 5: Complete Donor Account Deletion and Data Cleanup', () => {
    it('permanently deletes donor account and responses, anonymizes completed hospital records, and handles idempotency safely', async () => {
      // 1. Create a donor
      const donor = await Donor.create({
        name: 'Kenenisa Bekele',
        phone: '+251911999999',
        fin: 'FIN-KENEN-001',
        shortId: 'KENEN001',
        bloodType: 'A+',
        location: { type: 'Point', coordinates: [38.75, 9.03] },
      });
      const donorToken = generateToken({ id: donor._id.toString(), role: 'donor' });

      // Create a completed donation record for Hospital A
      const bloodReq = await BloodRequest.create({
        hospital: hospitalA._id,
        bloodType: 'A+',
        quantityNeeded: 1,
        closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const responseDoc = await BloodRequestResponse.create({
        bloodRequest: bloodReq._id,
        donor: donor._id,
        status: 'accepted',
        donationOutcome: 'donated',
      });

      const donationRecord = await DonationRecord.create({
        bloodRequest: bloodReq._id,
        bloodRequestResponse: responseDoc._id,
        donor: donor._id,
        hospital: hospitalA._id,
        outcome: 'donated',
        donationDate: new Date(),
        requestBloodType: 'A+',
        donorBloodType: 'A+',
        notes: 'Donor personal note: Kenenisa Bekele',
        thankYouMessage: 'Thank you Kenenisa!',
      });

      // 2. Donor deletes account via DELETE /api/donor/profile
      const deleteRes = await request(app)
        .delete('/api/donor/profile')
        .set('Authorization', `Bearer ${donorToken}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // 3. Verify permanent deletion of donor account
      const checkDonor = await Donor.findById(donor._id);
      expect(checkDonor).toBeNull();

      // 4. Verify donor responses/notifications are deleted
      const checkResponses = await BloodRequestResponse.find({ donor: donor._id });
      expect(checkResponses.length).toBe(0);

      // 5. Verify hospital operational donation record is preserved but anonymized (no PII)
      const freshRecord = await DonationRecord.findById(donationRecord._id);
      expect(freshRecord).not.toBeNull();
      expect(freshRecord.donor).toBeNull();
      expect(freshRecord.notes).toBeNull();
      expect(freshRecord.thankYouMessage).toBeNull();

      // 6. Hospital records view completely excludes deleted donors (no card rendered in Medical Records)
      const hospitalRecordsRes = await request(app)
        .get('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(hospitalRecordsRes.status).toBe(200);
      const deletedDonorCard = hospitalRecordsRes.body.records.find((r) => r.id === donationRecord._id.toString());
      expect(deletedDonorCard).toBeUndefined();

      // 7. Verify safe repeated deletion request returns 404 cleanly
      const repeatDelete = await request(app)
        .delete('/api/donor/profile')
        .set('Authorization', `Bearer ${donorToken}`);
      expect(repeatDelete.status).toBe(404);
    });

    it('ensures deleted donors never appear in blood request responses, queue, or counts, and walk-in donation does not trigger 403', async () => {
      // 1. Create two donors
      const donorActive = await Donor.create({
        name: 'Active Donor',
        phone: '+251911000001',
        fin: 'FIN-ACT-001',
        shortId: 'ACT00001',
        bloodType: 'B+',
        location: { type: 'Point', coordinates: [38.75, 9.03] },
      });
      const donorDeleted = await Donor.create({
        name: 'Deleted Donor',
        phone: '+251911000002',
        fin: 'FIN-DEL-002',
        shortId: 'DEL00002',
        bloodType: 'B+',
        isDeleted: true,
        location: { type: 'Point', coordinates: [38.75, 9.03] },
      });

      // 2. Create blood request for Hospital A
      const reqDoc = await BloodRequest.create({
        hospital: hospitalA._id,
        bloodType: 'B+',
        quantityNeeded: 2,
        closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // Active donor accepted
      const respActive = await BloodRequestResponse.create({
        bloodRequest: reqDoc._id,
        donor: donorActive._id,
        status: 'accepted',
      });

      // Deleted donor stale accepted response
      const respDeleted = await BloodRequestResponse.create({
        bloodRequest: reqDoc._id,
        donor: donorDeleted._id,
        status: 'accepted',
      });

      // 3. Test list blood requests: counts exclude deleted donor
      const listReqsRes = await request(app)
        .get('/api/hospital/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(listReqsRes.status).toBe(200);
      const matchedReq = (listReqsRes.body.requests || listReqsRes.body).find((r) => r._id === reqDoc._id.toString() || r.id === reqDoc._id.toString());
      expect(matchedReq).toBeDefined();
      expect(matchedReq.acceptedCount).toBe(1);

      // 4. Test getResponses: deleted donor is excluded from responses and accepted count
      const responsesRes = await request(app)
        .get(`/api/hospital/blood-requests/${reqDoc._id}/responses`)
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(responsesRes.status).toBe(200);
      expect(responsesRes.body.accepted.length).toBe(1);
      expect(responsesRes.body.accepted[0].shortId).toBe('ACT00001');
      const foundDeletedInResponses = (responsesRes.body.accepted || []).some(
        (r) => r.shortId === 'DEL00002'
      );
      expect(foundDeletedInResponses).toBe(false);

      // 5. Test queue & pending count in donation record controller
      const queueRes = await request(app)
        .get('/api/hospital/donation-records/pending')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(queueRes.status).toBe(200);
      const queueItems = Array.isArray(queueRes.body) ? queueRes.body : (queueRes.body.pendingQueue || []);
      expect(queueItems.length).toBe(1);
      expect(queueItems[0].donor.shortId).toBe('ACT00001');

      const countRes = await request(app)
        .get('/api/hospital/donation-records/pending/count')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(countRes.status).toBe(200);
      expect(countRes.body.count).toBe(1);

      // 6. Test accepted donors list
      const acceptedDonorsRes = await request(app)
        .get('/api/hospital/donation-records/accepted')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(acceptedDonorsRes.status).toBe(200);
      const acceptedList = acceptedDonorsRes.body.data || acceptedDonorsRes.body.donors || [];
      expect(acceptedList.length).toBe(1);
      expect(acceptedList[0].donor.shortId).toBe('ACT00001');

      // 7. Test record creation resolving request from response without explicit bloodRequestId: succeeds cleanly
      const recordRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestResponseId: respActive._id.toString(),
          donorBloodType: 'B+',
          donationDate: new Date().toISOString(),
          outcome: 'donated',
        });
      expect(recordRes.status).toBe(201);
      expect(recordRes.body.success).toBe(true);
      expect(recordRes.body.record).toBeDefined();

      // 8. Test record creation with already-purged response: returns 404
      const purgedRecordRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestResponseId: respDeleted._id.toString(),
          donorBloodType: 'B+',
          donationDate: new Date().toISOString(),
          outcome: 'donated',
        });
      expect(purgedRecordRes.status).toBe(404);

      // Create a fresh response referencing the deleted donor to test on-the-fly cleanup
      const unpurgedResp = await BloodRequestResponse.create({
        bloodRequest: reqDoc._id,
        donor: donorDeleted._id,
        status: 'accepted',
      });
      const deletedRecordRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestResponseId: unpurgedResp._id.toString(),
          donorBloodType: 'B+',
          donationDate: new Date().toISOString(),
          outcome: 'donated',
        });
      expect(deletedRecordRes.status).toBe(404);
      expect(deletedRecordRes.body.error).toContain('deleted');
      const checkCleaned = await BloodRequestResponse.findById(unpurgedResp._id);
      expect(checkCleaned).toBeNull();

      // 9. Stale/non-existent blood request returns 404, NOT 403
      const deletedReqId = new mongoose.Types.ObjectId();
      const respDeletedReq = await BloodRequestResponse.create({
        bloodRequest: deletedReqId,
        donor: donorActive._id,
        status: 'accepted',
      });
      const nonExistentReqRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: deletedReqId.toString(),
          bloodRequestResponseId: respDeletedReq._id.toString(),
          donorBloodType: 'B+',
          donationDate: new Date().toISOString(),
          outcome: 'donated',
        });
      expect(nonExistentReqRes.status).toBe(404);
      expect(nonExistentReqRes.body.error).toContain('not found');

      // 10. Request belonging to another hospital returns 403
      const reqHospitalB = await BloodRequest.create({
        hospital: hospitalB._id,
        bloodType: 'B+',
        quantityNeeded: 1,
        closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      const respHospitalB = await BloodRequestResponse.create({
        bloodRequest: reqHospitalB._id,
        donor: donorActive._id,
        status: 'accepted',
      });
      const forbiddenReqRes = await request(app)
        .post('/api/hospital/donation-records')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          bloodRequestId: reqHospitalB._id.toString(),
          bloodRequestResponseId: respHospitalB._id.toString(),
          donorBloodType: 'B+',
          donationDate: new Date().toISOString(),
          outcome: 'donated',
        });
      expect(forbiddenReqRes.status).toBe(403);
      expect(forbiddenReqRes.body.error).toContain('Unauthorized blood request access');
    });
  });
});

