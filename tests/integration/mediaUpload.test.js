const request = require('supertest');
const app = require('../../server');
const generateToken = require('../../src/utils/generateToken');
const Donor = require('../../src/models/Donor');
const SuperAdmin = require('../../src/models/SuperAdmin');

describe('Integration Tests: Media Upload via Cloudinary', () => {
  let token;
  let donorToken;

  beforeEach(async () => {
    await Donor.deleteMany({});
    await SuperAdmin.deleteMany({});

    const donor = await Donor.create({
      name: 'Test Donor',
      email: 'donor@example.com',
      phone: '+251911111111',
      fin: '1234567890',
      pinHash: '123456',
      location: {
        type: 'Point',
        coordinates: [38.74, 9.03],
      },
    });
    donorToken = generateToken({ id: donor._id.toString(), role: 'donor' });

    const superAdmin = await SuperAdmin.create({
      name: 'Test Admin',
      email: 'admin@example.com',
      passwordHash: 'dummyhash',
    });
    token = generateToken({ id: superAdmin._id.toString(), role: 'superadmin' });
  });

  test('POST /api/media -> should reject request without token (401)', async () => {
    const res = await request(app)
      .post('/api/media')
      .attach('file', Buffer.from('fake-image-content'), 'image.png');

    expect(res.statusCode).toBe(401);
  });

  test('POST /api/media -> should reject request if no file is attached (400)', async () => {
    const res = await request(app)
      .post('/api/media')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/no file/i);
  });

  test('POST /api/media -> should upload image successfully and return secure url', async () => {
    const res = await request(app)
      .post('/api/media')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-image-content'), 'image.png');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toBeDefined();
    expect(res.body.resourceType).toBe('image');
  });

  test('POST /api/media -> should upload video successfully and return correct resource type', async () => {
    const res = await request(app)
      .post('/api/media')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-video-content'), 'video.mp4');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.resourceType).toBe('video');
  });

  test('POST /api/media -> should upload PDF document successfully as raw resource', async () => {
    const res = await request(app)
      .post('/api/media')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-pdf-content'), 'document.pdf');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.resourceType).toBe('raw');
  });

  test('POST /api/media -> should reject invalid file type (400)', async () => {
    const res = await request(app)
      .post('/api/media')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-text-content'), 'notes.txt');

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/invalid file type/i);
  });

  test('POST /api/media -> should reject non-admin/superadmin requests (403)', async () => {
    const res = await request(app)
      .post('/api/media')
      .set('Authorization', `Bearer ${donorToken}`)
      .attach('file', Buffer.from('fake-image-content'), 'image.png');

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/permission/i);
  });
});
