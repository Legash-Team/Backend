const mongoose = require('mongoose');
const Event = require('../../src/models/Event');
const eventController = require('../../src/controllers/eventController');

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((data) => {
    res.body = data;
    return res;
  });
  return res;
}

describe('Event Controller Unit Tests', () => {
  beforeEach(async () => {
    await Event.deleteMany({});
  });

  describe('createEvent', () => {
    it('creates an event with all fields and computes status open for future closesAt', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const req = {
        user: { id: new mongoose.Types.ObjectId().toString(), role: 'superadmin' },
        body: {
          description: 'Blood Donation Camp 2026',
          mediaUrl: 'https://example.com/poster.jpg',
          mediaType: 'image',
          applyLink: 'https://example.com/apply',
          closesAt: futureDate,
        },
      };
      const res = mockResponse();
      const next = jest.fn();

      await eventController.createEvent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body.success).toBe(true);
      expect(res.body.event).toBeDefined();
      expect(res.body.event.description).toBe('Blood Donation Camp 2026');
      expect(res.body.event.mediaUrl).toBe('https://example.com/poster.jpg');
      expect(res.body.event.mediaType).toBe('image');
      expect(res.body.event.applyLink).toBe('https://example.com/apply');
      expect(res.body.event.status).toBe('open');

      const dbEvent = await Event.findById(res.body.event.id);
      expect(dbEvent).toBeDefined();
      expect(dbEvent.description).toBe('Blood Donation Camp 2026');
      expect(dbEvent.mediaUrl).toBe('https://example.com/poster.jpg');
    });

    it('returns 400 when description or closesAt is missing', async () => {
      const reqNoDesc = {
        user: { role: 'superadmin' },
        body: { closesAt: new Date().toISOString() },
      };
      const res1 = mockResponse();
      const next1 = jest.fn();
      await eventController.createEvent(reqNoDesc, res1, next1);
      expect(res1.status).toHaveBeenCalledWith(400);

      const reqNoClosesAt = {
        user: { role: 'superadmin' },
        body: { description: 'Some event' },
      };
      const res2 = mockResponse();
      const next2 = jest.fn();
      await eventController.createEvent(reqNoClosesAt, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when closesAt is an invalid date', async () => {
      const req = {
        user: { role: 'superadmin' },
        body: { description: 'Some event', closesAt: 'invalid-date' },
      };
      const res = mockResponse();
      const next = jest.fn();

      await eventController.createEvent(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toBe('A valid closesAt timestamp is required.');
    });
  });

  describe('listEvents', () => {
    it('returns events with future closesAt as open and past closesAt as closed (without filtering closed ones)', async () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      await Event.create({
        description: 'Upcoming Active Event',
        mediaUrl: 'https://example.com/event1.jpg',
        mediaType: 'image',
        closesAt: futureDate,
      });

      await Event.create({
        description: 'Expired Past Event',
        mediaUrl: 'https://example.com/event2.jpg',
        mediaType: 'image',
        closesAt: pastDate,
      });

      const req = {};
      const res = mockResponse();
      const next = jest.fn();

      await eventController.listEvents(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.events).toHaveLength(2);

      const activeEvent = res.body.events.find((e) => e.description === 'Upcoming Active Event');
      const closedEvent = res.body.events.find((e) => e.description === 'Expired Past Event');

      expect(activeEvent).toBeDefined();
      expect(activeEvent.status).toBe('open');

      expect(closedEvent).toBeDefined();
      expect(closedEvent.status).toBe('closed');
    });
  });
});
