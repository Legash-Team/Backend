const request = require('supertest');
const express = require('express');
const eventRoutes = require('../../src/routes/eventRoutes');
const errorHandler = require('../../src/middleware/errorHandler');
const Event = require('../../src/models/Event');
const SuperAdmin = require('../../src/models/SuperAdmin');
const Donor = require('../../src/models/Donor');
const generateToken = require('../../src/utils/generateToken');
const { hashPassword } = require('../../src/utils/hashPassword');

const app = express();
app.use(express.json());
app.use('/api/donor/events', eventRoutes);
app.use(errorHandler);

describe('Integration Tests: Event Posting & Donor Event Feed', () => {
  let superAdminToken;
  let donorToken;
  let hospitalToken;

  beforeEach(async () => {
    await Event.deleteMany({});
    await SuperAdmin.deleteMany({});
    await Donor.deleteMany({});

    const passwordHash = await hashPassword('SuperSecret123!');
    const superAdmin = await SuperAdmin.create({
      name: 'Event SuperAdmin',
      email: 'events.admin@legash.org',
      passwordHash,
    });
    superAdminToken = generateToken({ id: superAdmin._id.toString(), role: 'superadmin' });

    const donor = await Donor.create({
      name: 'Donor User',
      passwordHash,
      phone: '+251911999999',
      fin: 'FIN-999999',
      gender: 'male',
      bloodType: 'O+',
      location: { type: 'Point', coordinates: [38.74, 9.03] },
      agreedToTerms: true,
      phoneVerified: true,
    });
    donorToken = generateToken({ id: donor._id.toString(), role: 'donor' });
    hospitalToken = generateToken({ id: 'dummy_hospital_id', role: 'hospital' });
  });

  describe('POST /api/donor/events (Super Admin Event Posting)', () => {
    test('Super Admin creates an event successfully (201)', async () => {
      const futureClosesAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/donor/events')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          description: 'Grand Blood Drive at Meskel Square',
          mediaUrl: 'https://example.com/banner.png',
          mediaType: 'image',
          applyLink: 'https://legash.org/events/register',
          closesAt: futureClosesAt,
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.event).toMatchObject({
        description: 'Grand Blood Drive at Meskel Square',
        mediaUrl: 'https://example.com/banner.png',
        mediaType: 'image',
        applyLink: 'https://legash.org/events/register',
        status: 'open',
      });

      const dbEvent = await Event.findOne({ description: 'Grand Blood Drive at Meskel Square' });
      expect(dbEvent).toBeDefined();
    });

    test('Non-Super-Admin (donor / hospital) request to create an event is rejected with 403', async () => {
      const futureClosesAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const resDonor = await request(app)
        .post('/api/donor/events')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          description: 'Donor Attempted Event',
          closesAt: futureClosesAt,
        });
      expect(resDonor.statusCode).toBe(403);

      const resHospital = await request(app)
        .post('/api/donor/events')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          description: 'Hospital Attempted Event',
          closesAt: futureClosesAt,
        });
      expect(resHospital.statusCode).toBe(403);
    });

    test('Unauthenticated request to create an event is rejected with 401', async () => {
      const res = await request(app)
        .post('/api/donor/events')
        .send({
          description: 'No Auth Event',
          closesAt: new Date().toISOString(),
        });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/donor/events (Donor Event Feed)', () => {
    test('Donor lists events: future event shows status open, past event shows status closed and is still in the list', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      await Event.create({
        description: 'Open Future Campaign',
        mediaUrl: 'https://example.com/open.png',
        closesAt: futureDate,
      });

      await Event.create({
        description: 'Closed Past Campaign',
        mediaUrl: 'https://example.com/closed.png',
        closesAt: pastDate,
      });

      const res = await request(app)
        .get('/api/donor/events')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.events).toHaveLength(2);

      const openEvent = res.body.events.find((e) => e.description === 'Open Future Campaign');
      const closedEvent = res.body.events.find((e) => e.description === 'Closed Past Campaign');

      expect(openEvent).toBeDefined();
      expect(openEvent.status).toBe('open');

      expect(closedEvent).toBeDefined();
      expect(closedEvent.status).toBe('closed');
    });

    test('Unauthenticated request to get donor event feed is rejected with 401', async () => {
      const res = await request(app).get('/api/donor/events');
      expect(res.statusCode).toBe(401);
    });
  });
});
