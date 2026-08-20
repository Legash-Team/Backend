const request = require('supertest');
const express = require('express');
const donorNotificationRoutes = require('../../src/routes/donorNotificationRoutes');
const errorHandler = require('../../src/middleware/errorHandler');
const BloodRequest = require('../../src/models/BloodRequest');
const BloodRequestResponse = require('../../src/models/BloodRequestResponse');
const Hospital = require('../../src/models/Hospital');
const Donor = require('../../src/models/Donor');
const generateToken = require('../../src/utils/generateToken');

const donorNotificationController = require('../../src/controllers/donorNotificationController');
const verifyToken = require('../../src/middleware/authMiddleware');
const requireRole = require('../../src/middleware/requireRole');

const app = express();
app.use(express.json());
app.use('/api/donor/notifications', donorNotificationRoutes);
app.post('/api/donor/push-token', verifyToken, requireRole('donor'), donorNotificationController.registerPushToken);
app.use(errorHandler);

describe('Donor Notifications API', () => {
  it('should list notifications, allow respond, and handle edge cases', async () => {
    const hospital = await Hospital.create({
      hospitalName: 'Notification Hospital',
      licenseNumber: 'LIC-NOTIFY',
      phone: '+251922000001',
      email: 'notify@hospital.com',
      passwordHash: 'hashed',
      location: { type: 'Point', coordinates: [38.7, 9.0] },
      emailVerified: true,
      verificationStatus: 'approved',
      agreedToTerms: true
    });

    const donor1 = await Donor.create({
      name: 'Active Donor',
      phone: '+251922000002',
      fin: 'FIN201',
      gender: 'male',
      bloodType: 'A+',
      location: { type: 'Point', coordinates: [38.7, 9.0] },
      phoneVerified: true,
      passwordHash: 'hashed',
      agreedToTerms: true
    });
    const donor1Token = generateToken({ id: donor1._id, role: 'donor' });

    const requestDoc = await BloodRequest.create({
      hospital: hospital._id,
      bloodType: 'A+',
      quantityNeeded: 2,
      status: 'open',
      closesAt: new Date(Date.now() + 8 * 3600000)
    });

    const responseDoc = await BloodRequestResponse.create({
      bloodRequest: requestDoc._id,
      donor: donor1._id,
      status: 'pending'
    });

    let res = await request(app)
      .get('/api/donor/notifications')
      .set('Authorization', `Bearer ${donor1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notifications.length).toBe(1);
    expect(res.body.notifications[0].hospitalName).toBe('Notification Hospital');
    expect(res.body.notifications[0].myResponseStatus).toBe('pending');
    expect(res.body.notifications[0].requestStatus).toBe('open');

    res = await request(app)
      .post('/api/donor/push-token')
      .set('Authorization', `Bearer ${donor1Token}`)
      .send({ pushToken: 'fcm-token-123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    
    const updatedDonor = await Donor.findById(donor1._id);
    expect(updatedDonor.pushToken).toBe('fcm-token-123');

    res = await request(app)
      .post(`/api/donor/notifications/${responseDoc._id}/respond`)
      .set('Authorization', `Bearer ${donor1Token}`)
      .send({ response: 'accepted' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedResp = await BloodRequestResponse.findById(responseDoc._id);
    expect(updatedResp.status).toBe('accepted');
    expect(updatedResp.respondedAt).not.toBeNull();

    res = await request(app)
      .post(`/api/donor/notifications/${responseDoc._id}/respond`)
      .set('Authorization', `Bearer ${donor1Token}`)
      .send({ response: 'denied' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("You've already responded to this request.");

    const requestDoc2 = await BloodRequest.create({
      hospital: hospital._id,
      bloodType: 'A+',
      quantityNeeded: 2,
      status: 'closed',
      closedReason: 'manual',
      closesAt: new Date(Date.now() + 8 * 3600000)
    });

    const responseDoc2 = await BloodRequestResponse.create({
      bloodRequest: requestDoc2._id,
      donor: donor1._id,
      status: 'pending'
    });

    res = await request(app)
      .post(`/api/donor/notifications/${responseDoc2._id}/respond`)
      .set('Authorization', `Bearer ${donor1Token}`)
      .send({ response: 'accepted' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("This request has already closed.");

    const untouchedResp = await BloodRequestResponse.findById(responseDoc2._id);
    expect(untouchedResp.status).toBe('pending');
  });
});