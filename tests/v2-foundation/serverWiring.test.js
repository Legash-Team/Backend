const request = require('supertest');

describe('server.js V2 wiring', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../../src/utils/v2Loader');
  });

  test('registers V2 routes once, before errorHandler, and does not start jobs in test env', () => {
    jest.isolateModules(() => {
      const errorHandler = require('../../src/middleware/errorHandler');
      const calls = [];
      jest.doMock('../../src/utils/v2Loader', () => ({
        loadV2Routes: jest.fn((app) => {
          calls.push({
            errorHandlerAlreadyRegistered: app._router.stack.some((l) => l.handle === errorHandler)
          });
          return [];
        }),
        startV2Jobs: jest.fn()
      }));

      const app = require('../../server');
      const loader = require('../../src/utils/v2Loader');

      expect(loader.loadV2Routes).toHaveBeenCalledTimes(1);
      expect(calls[0].errorHandlerAlreadyRegistered).toBe(false);
      const stack = app._router.stack;
      expect(stack[stack.length - 1].handle).toBe(errorHandler);
      expect(loader.startV2Jobs).not.toHaveBeenCalled();
    });
  });

  test('health check and an existing guarded route still behave with the real loader', async () => {
    const app = require('../../server');
    const health = await request(app).get('/');
    expect(health.statusCode).toBe(200);
    expect(health.body.status).toBe('Legash API running');
    const guarded = await request(app).get('/api/hospital/profile');
    expect(guarded.statusCode).toBe(401);
  });
});
