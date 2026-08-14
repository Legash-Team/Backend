// tests/future/authMiddleware.test.js
const verifyToken = require('../../src/middleware/authMiddleware');

describe('Future Tests: Auth Middleware', () => {
  test.skip('verifyToken -> rejects request without Authorization header', () => {
    const req = { headers: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});