// Backend/tests/events/eventAttribution.test.js
const request = require('supertest');
const app = require('../../server');
const Admin = require('../../src/models/Admin');
const SuperAdmin = require('../../src/models/SuperAdmin');
const Donor = require('../../src/models/Donor');
const Event = require('../../src/models/Event');
const generateToken = require('../../src/utils/generateToken');

describe('Event Attribution & Admin Event List API', () => {
  let adminA, adminAToken;
  let adminB, adminBToken;
  let superAdmin, superAdminToken;
  let donor, donorToken;
  let futureDate;

  beforeEach(async () => {
    await Event.deleteMany({});
    await Admin.deleteMany({});
    await SuperAdmin.deleteMany({});
    await Donor.deleteMany({});

    futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    adminA = await Admin.create({
      name: 'Dr. Hana',
      email: 'hana@redcross.org',
      centerName: 'Ethiopian Red Cross Society',
      permissions: { canPostEvents: true },
      emailVerified: true,
    });
    adminAToken = generateToken({ id: adminA._id, role: 'admin' });

    adminB = await Admin.create({
      name: 'Dr. Bekele',
      email: 'bekele@center.org',
      permissions: { canPostEvents: true },
      emailVerified: true,
    });
    adminBToken = generateToken({ id: adminB._id, role: 'admin' });

    superAdmin = await SuperAdmin.create({
      name: 'SuperAdmin User',
      email: 'super@legash.org',
      passwordHash: 'hashed',
    });
    superAdminToken = generateToken({ id: superAdmin._id, role: 'superadmin' });

    donor = await Donor.create({
      name: 'Test Donor',
      phone: '+251911999888',
      fin: 'FIN-999',
      bloodType: 'B+',
      location: { type: 'Point', coordinates: [38.74, 9.01] },
      phoneVerified: true,
    });
    donorToken = generateToken({ id: donor._id, role: 'donor' });
  });

  describe('GET /api/donor/events — Public Event Attribution', () => {
    it('includes postedBy with centerName for Admin-created events and strictly omits postedBy for SuperAdmin events', async () => {
      // Create an Admin-created event (with centerName)
      await Event.create({
        title: 'Red Cross Blood Drive',
        description: 'Annual National Blood Donation Day',
        closesAt: futureDate,
        createdBy: adminA._id,
        creatorModel: 'Admin',
      });

      // Create an Admin-created event without centerName (falls back to name)
      await Event.create({
        title: 'Community Drive',
        description: 'Community blood collection',
        closesAt: futureDate,
        createdBy: adminB._id,
        creatorModel: 'Admin',
      });

      // Create a SuperAdmin-created event
      await Event.create({
        title: 'National Health Campaign',
        description: 'Ministry of Health Blood Drive',
        closesAt: futureDate,
        createdBy: superAdmin._id,
        creatorModel: 'SuperAdmin',
      });

      const res = await request(app)
        .get('/api/donor/events')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.events).toHaveLength(3);

      const redCrossEvent = res.body.events.find((e) => e.title === 'Red Cross Blood Drive');
      expect(redCrossEvent).toBeDefined();
      expect(redCrossEvent.postedBy).toBe('Ethiopian Red Cross Society');

      const communityEvent = res.body.events.find((e) => e.title === 'Community Drive');
      expect(communityEvent).toBeDefined();
      expect(communityEvent.postedBy).toBe('Dr. Bekele');

      const nationalEvent = res.body.events.find((e) => e.title === 'National Health Campaign');
      expect(nationalEvent).toBeDefined();
      // Crucial requirement: SuperAdmin event JSON must omit the postedBy property entirely
      expect(nationalEvent).not.toHaveProperty('postedBy');
    });

    it('filters out expired events from the public feed', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      await Event.create({
        title: 'Past Event',
        description: 'Already closed event',
        closesAt: pastDate,
        status: 'closed',
        createdBy: adminA._id,
        creatorModel: 'Admin',
      });

      const res = await request(app)
        .get('/api/donor/events')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(0);
    });
  });

  describe('GET /api/admin/events/mine — Admin Private Event List', () => {
    beforeEach(async () => {
      await Event.create([
        {
          title: 'Admin A Event 1',
          description: 'Desc 1',
          closesAt: futureDate,
          createdBy: adminA._id,
          creatorModel: 'Admin',
          createdAt: new Date('2026-10-01T10:00:00Z'),
        },
        {
          title: 'Admin A Event 2',
          description: 'Desc 2',
          closesAt: futureDate,
          createdBy: adminA._id,
          creatorModel: 'Admin',
          createdAt: new Date('2026-10-02T10:00:00Z'),
        },
        {
          title: 'Admin B Event 1',
          description: 'Desc B',
          closesAt: futureDate,
          createdBy: adminB._id,
          creatorModel: 'Admin',
        },
        {
          title: 'SuperAdmin Event',
          description: 'Desc Super',
          closesAt: futureDate,
          createdBy: superAdmin._id,
          creatorModel: 'SuperAdmin',
        },
      ]);
    });

    it('returns only the authenticated admin’s events in newest-first order', async () => {
      const res = await request(app)
        .get('/api/admin/events/mine')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.events).toHaveLength(2);
      expect(res.body.events.map((e) => e.title)).toEqual([
        'Admin A Event 2',
        'Admin A Event 1',
      ]);
    });

    it('ensures Admin B cannot see Admin A events in /mine', async () => {
      const res = await request(app)
        .get('/api/admin/events/mine')
        .set('Authorization', `Bearer ${adminBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].title).toBe('Admin B Event 1');
    });

    it('rejects Donor with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/events/mine')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects Super Admin with 403 Forbidden (mine is scoped to Admin role)', async () => {
      const res = await request(app)
        .get('/api/admin/events/mine')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/admin/events/mine');
      expect(res.status).toBe(401);
    });
  });
});
