const request = require('supertest');
const app = require('../../server');

describe('Integration Tests: Security Upgrades', () => {
  describe('HTTP Security Headers (Helmet)', () => {
    test('should include secure HTTP headers in API responses', async () => {
      const res = await request(app).get('/');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('CORS Origin Restriction', () => {
    let originalAllowedOrigins;

    beforeAll(() => {
      originalAllowedOrigins = process.env.ALLOWED_ORIGINS;
    });

    afterAll(() => {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    });

    test('should allow requests from a trusted origin', async () => {
      process.env.ALLOWED_ORIGINS = 'http://trusted-client.com,http://another.com';

      const res = await request(app)
        .get('/')
        .set('Origin', 'http://trusted-client.com');

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://trusted-client.com');
    });

    test('should block requests from an untrusted origin', async () => {
      process.env.ALLOWED_ORIGINS = 'http://trusted-client.com';

      const res = await request(app)
        .get('/')
        .set('Origin', 'http://malicious-site.com');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/cors/i);
    });
  });

  describe('NoSQL Injection Prevention (express-mongo-sanitize)', () => {
    test('should sanitize keys starting with $ from request body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: { '$ne': null },
          password: 'Password123!',
        });

      // The sanitizer will remove the '$ne' key, leaving email as empty object/empty,
      // resulting in a validation failure (400 Bad Request) instead of authentication bypass.
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/required/i);
    });
  });
});
