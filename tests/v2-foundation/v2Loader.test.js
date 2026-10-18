const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { loadV2Routes, startV2Jobs } = require('../../src/utils/v2Loader');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'legash-v2-'));
}

function writeFile(dir, name, body) {
  fs.writeFileSync(path.join(dir, name), body);
}

// Fixtures live outside the repo, so they need the absolute path to express.
function routeModuleSource(mountPath, message) {
  return `
const express = require(${JSON.stringify(require.resolve('express'))});
const router = express.Router();
router.get('/', (req, res) => res.json({ success: true, message: ${JSON.stringify(message)} }));
module.exports = { mounts: [{ path: ${JSON.stringify(mountPath)}, router }] };
`;
}

describe('loadV2Routes', () => {
  let dir;
  beforeEach(() => {
    dir = makeTempDir();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a missing directory is not an error', () => {
    expect(loadV2Routes(express(), path.join(dir, 'does-not-exist'))).toEqual([]);
  });

  test('an empty directory mounts nothing', () => {
    expect(loadV2Routes(express(), dir)).toEqual([]);
  });

  test('mounts modules in sorted order and serves their routes', async () => {
    writeFile(dir, 'b.js', routeModuleSource('/api/v2-b', 'b'));
    writeFile(dir, 'a.js', routeModuleSource('/api/v2-a', 'a'));
    writeFile(dir, '.gitkeep', '');
    writeFile(dir, 'README.md', '# not a module');
    fs.mkdirSync(path.join(dir, 'nested'));
    writeFile(path.join(dir, 'nested'), 'c.js', routeModuleSource('/api/v2-c', 'c'));

    const app = express();
    const mounted = loadV2Routes(app, dir);

    expect(mounted.map((m) => m.file)).toEqual(['a.js', 'b.js']);
    const resA = await request(app).get('/api/v2-a');
    expect(resA.statusCode).toBe(200);
    expect(resA.body.message).toBe('a');
    const resC = await request(app).get('/api/v2-c');
    expect(resC.statusCode).toBe(404);
  });

  test('a module without a mounts array is skipped without crashing', () => {
    writeFile(dir, 'helper.js', 'module.exports = { notRoutes: true };');
    expect(loadV2Routes(express(), dir)).toEqual([]);
  });

  test('a module with several mounts registers all of them', async () => {
    writeFile(
      dir,
      'multi.js',
      `
const express = require(${JSON.stringify(require.resolve('express'))});
const one = express.Router();
const two = express.Router();
one.get('/', (req, res) => res.json({ n: 1 }));
two.get('/', (req, res) => res.json({ n: 2 }));
module.exports = { mounts: [{ path: '/api/v2-one', router: one }, { path: '/api/v2-two', router: two }] };
`
    );
    const app = express();
    loadV2Routes(app, dir);
    expect((await request(app).get('/api/v2-one')).body.n).toBe(1);
    expect((await request(app).get('/api/v2-two')).body.n).toBe(2);
  });

  test('an invalid mount fails fast and names the file', () => {
    writeFile(
      dir,
      'bad.js',
      "module.exports = { mounts: [{ path: 'no-leading-slash', router: {} }] };"
    );
    expect(() => loadV2Routes(express(), dir)).toThrow(/bad\.js/);
  });
});

describe('startV2Jobs', () => {
  let dir;
  beforeEach(() => {
    dir = makeTempDir();
    global.__v2JobCalls = [];
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete global.__v2JobCalls;
  });

  test('a missing directory is not an error', () => {
    expect(startV2Jobs(path.join(dir, 'does-not-exist'))).toEqual([]);
  });

  test('calls start() once per job, skips files without start(), and ignores non-js files', () => {
    writeFile(dir, 'a.js', "module.exports = { start() { global.__v2JobCalls.push('a'); } };");
    writeFile(dir, 'helper.js', 'module.exports = { notAJob: true };');
    writeFile(dir, '.gitkeep', '');
    expect(startV2Jobs(dir)).toEqual(['a.js']);
    expect(global.__v2JobCalls).toEqual(['a']);
  });

  test('calling startV2Jobs twice does not start the same job twice', () => {
    writeFile(
      dir,
      'once.js',
      "module.exports = { start() { global.__v2JobCalls.push('once'); } };"
    );
    startV2Jobs(dir);
    startV2Jobs(dir);
    expect(global.__v2JobCalls).toEqual(['once']);
  });

  test('one failing job does not stop the others', () => {
    writeFile(dir, 'a-bad.js', "module.exports = { start() { throw new Error('boom'); } };");
    writeFile(
      dir,
      'b-good.js',
      "module.exports = { start() { global.__v2JobCalls.push('good'); } };"
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(startV2Jobs(dir)).toEqual(['b-good.js']);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
