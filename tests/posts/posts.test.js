// Backend/tests/posts/posts.test.js
const request = require('supertest');
const app = require('../../server');
const Admin = require('../../src/models/Admin');
const SuperAdmin = require('../../src/models/SuperAdmin');
const Donor = require('../../src/models/Donor');
const Post = require('../../src/models/Post');
const generateToken = require('../../src/utils/generateToken');

describe('Blood Center Posts & Donor Feed API', () => {
  let adminA, adminAToken;
  let adminB, adminBToken;
  let superAdmin, superAdminToken;
  let donor, donorToken;

  beforeEach(async () => {
    await Post.deleteMany({});
    await Admin.deleteMany({});
    await SuperAdmin.deleteMany({});
    await Donor.deleteMany({});

    adminA = await Admin.create({
      name: 'Dr. Abebe',
      email: 'abebe@center.org',
      permissions: { canPostEvents: true },
      emailVerified: true,
    });
    adminA.centerName = 'Addis Blood Center';
    await adminA.save();
    adminAToken = generateToken({ id: adminA._id, role: 'admin' });

    adminB = await Admin.create({
      name: 'Dr. Chala',
      email: 'chala@center.org',
      permissions: { canPostEvents: true },
      emailVerified: true,
    });
    adminBToken = generateToken({ id: adminB._id, role: 'admin' });

    superAdmin = await SuperAdmin.create({
      name: 'Super Admin',
      email: 'super@legash.org',
      passwordHash: 'hashed',
    });
    superAdminToken = generateToken({ id: superAdmin._id, role: 'superadmin' });

    donor = await Donor.create({
      name: 'Almaz Donor',
      phone: '+251911000111',
      fin: 'FIN-111',
      bloodType: 'A+',
      location: { type: 'Point', coordinates: [38.74, 9.01] },
      phoneVerified: true,
    });
    donorToken = generateToken({ id: donor._id, role: 'donor' });
  });

  describe('POST /api/admin/posts — Create Post', () => {
    it('creates a post successfully when authenticated as Admin', async () => {
      const res = await request(app)
        .post('/api/admin/posts')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          content: 'Urgent need for O- blood donors at Addis Blood Center today.',
          mediaUrl: 'https://cloudinary.com/sample.jpg',
          mediaType: 'image',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.post).toHaveProperty('id');
      expect(res.body.post.content).toBe('Urgent need for O- blood donors at Addis Blood Center today.');
      expect(res.body.post.mediaType).toBe('image');

      const saved = await Post.findById(res.body.post.id);
      expect(saved).not.toBeNull();
      expect(saved.author.toString()).toBe(adminA._id.toString());
    });

    it('rejects Super Admin with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/admin/posts')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          content: 'Super Admin trying to post directly.',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('rejects Donor with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/admin/posts')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({ content: 'Donor trying to post.' });

      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/admin/posts')
        .send({ content: 'Unauthenticated post.' });

      expect(res.status).toBe(401);
    });

    it('validates required content and maximum length', async () => {
      // Empty content
      let res = await request(app)
        .post('/api/admin/posts')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ content: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Content is required/i);

      // Oversized content (> 2000 chars)
      const longContent = 'A'.repeat(2001);
      res = await request(app)
        .post('/api/admin/posts')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ content: longContent });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot exceed 2000 characters/i);
    });

    it('validates allowed mediaType values', async () => {
      const res = await request(app)
        .post('/api/admin/posts')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          content: 'Post with invalid media type.',
          mediaType: 'audio',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid mediaType/i);
    });
  });

  describe('GET /api/admin/posts — My Posts', () => {
    beforeEach(async () => {
      await Post.create([
        { author: adminA._id, content: 'Admin A post 1', createdAt: new Date('2026-10-01') },
        { author: adminA._id, content: 'Admin A post 2', createdAt: new Date('2026-10-05') },
        { author: adminA._id, content: 'Admin A deleted post', isDeleted: true },
        { author: adminB._id, content: 'Admin B post 1' },
      ]);
    });

    it('returns only the authenticated admin’s active posts in newest-first order', async () => {
      const res = await request(app)
        .get('/api/admin/posts')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.posts).toHaveLength(2);
      expect(res.body.posts[0].content).toBe('Admin A post 2');
      expect(res.body.posts[1].content).toBe('Admin A post 1');
    });

    it('does not allow Admin B to see Admin A posts in my-posts list', async () => {
      const res = await request(app)
        .get('/api/admin/posts')
        .set('Authorization', `Bearer ${adminBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.posts).toHaveLength(1);
      expect(res.body.posts[0].content).toBe('Admin B post 1');
    });
  });

  describe('GET /api/donor/feed — Donor Feed', () => {
    beforeEach(async () => {
      await Post.create([
        {
          author: adminA._id,
          content: 'Oldest post',
          createdAt: new Date('2026-10-01T10:00:00Z'),
        },
        {
          author: adminB._id,
          content: 'Middle post',
          createdAt: new Date('2026-10-02T10:00:00Z'),
        },
        {
          author: adminA._id,
          content: 'Newest post',
          createdAt: new Date('2026-10-03T10:00:00Z'),
        },
        {
          author: adminA._id,
          content: 'Deleted post',
          isDeleted: true,
          createdAt: new Date('2026-10-04T10:00:00Z'),
        },
      ]);
    });

    it('returns paginated active posts sorted newest-first for authenticated donors', async () => {
      const res = await request(app)
        .get('/api/donor/feed?page=1&limit=2')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.feed).toHaveLength(2);
      expect(res.body.feed[0].content).toBe('Newest post');
      // Admin A has centerName = 'Addis Blood Center'
      expect(res.body.feed[0].authorName).toBe('Addis Blood Center');

      expect(res.body.feed[1].content).toBe('Middle post');
      // Admin B does not have centerName, falls back to name 'Dr. Chala'
      expect(res.body.feed[1].authorName).toBe('Dr. Chala');

      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('respects page 2 pagination and skips properly', async () => {
      const res = await request(app)
        .get('/api/donor/feed?page=2&limit=2')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.feed).toHaveLength(1);
      expect(res.body.feed[0].content).toBe('Oldest post');
    });

    it('caps limit at 50 if higher limit is requested', async () => {
      const res = await request(app)
        .get('/api/donor/feed?limit=100')
        .set('Authorization', `Bearer ${donorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(50);
    });

    it('rejects unauthenticated requests to feed with 401', async () => {
      const res = await request(app).get('/api/donor/feed');
      expect(res.status).toBe(401);
    });
  });
});
