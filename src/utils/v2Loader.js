// Discovers V2 route modules and job modules so new features can be added as
// independent files without editing server.js.
//
// Route module (src/routes/v2/*.js) must export:
//   module.exports = { mounts: [{ path: '/api/example', router }] };
// Job module (src/jobs/v2/*.js) must export:
//   module.exports = { start() { /* schedule work here, never at require time */ } };
const fs = require('fs');
const path = require('path');

const DEFAULT_ROUTES_DIR = path.join(__dirname, '..', 'routes', 'v2');
const DEFAULT_JOBS_DIR = path.join(__dirname, '..', 'jobs', 'v2');

// Job files already started, so calling startV2Jobs() twice never double-schedules.
const startedJobFiles = new Set();

function isTestEnv() {
  return process.env.NODE_ENV === 'test';
}

// Direct children only, files ending in .js, sorted for a deterministic order.
function listModuleFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();
}

function loadV2Routes(app, dir = DEFAULT_ROUTES_DIR) {
  const mounted = [];
  for (const file of listModuleFiles(dir)) {
    const mod = require(path.join(dir, file));
    if (!mod || !Array.isArray(mod.mounts)) {
      if (!isTestEnv()) console.warn(`[V2 Routes] ${file} has no "mounts" array, skipped.`);
      continue;
    }
    mod.mounts.forEach((mount, index) => {
      const valid =
        mount &&
        typeof mount.path === 'string' &&
        mount.path.startsWith('/') &&
        typeof mount.router === 'function';
      if (!valid) {
        throw new Error(
          `[V2 Routes] Invalid mount #${index} in ${file}: expected { path: '/...', router }.`
        );
      }
      app.use(mount.path, mount.router);
      mounted.push({ file, path: mount.path });
      if (!isTestEnv()) console.log(`[V2 Routes] ${file} -> ${mount.path}`);
    });
  }
  return mounted;
}

function startV2Jobs(dir = DEFAULT_JOBS_DIR) {
  const started = [];
  for (const file of listModuleFiles(dir)) {
    const fullPath = path.join(dir, file);
    if (startedJobFiles.has(fullPath)) continue;
    const mod = require(fullPath);
    if (!mod || typeof mod.start !== 'function') {
      if (!isTestEnv()) console.warn(`[V2 Jobs] ${file} does not export start(), skipped.`);
      continue;
    }
    try {
      mod.start();
      startedJobFiles.add(fullPath);
      started.push(file);
      if (!isTestEnv()) console.log(`[V2 Jobs] started ${file}`);
    } catch (error) {
      console.error(`[V2 Jobs] Failed to start ${file}:`, error.message);
    }
  }
  return started;
}

module.exports = { loadV2Routes, startV2Jobs, DEFAULT_ROUTES_DIR, DEFAULT_JOBS_DIR };
