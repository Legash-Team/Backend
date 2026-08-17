// Contract E2E (CI-safe): boots the real Backend against a clean throwaway DB,
// runs the Postman collection (Newman) against it, then tears everything down.
//
// This is the executable merge gate: the same collection that frontend teams use
// must pass against the real Backend, exactly as it passes against the mock.
//
// Usage: npm run test:contract:e2e
//   Optionally: CONTRACT_MONGO_URI=... to point at a different throwaway Mongo.

const { spawn } = require('child_process');
const path = require('path');
const newman = require('newman');
const mongoose = require('mongoose');

const PORT = Number(process.env.CONTRACT_PORT || 3100);
const BASE = `http://localhost:${PORT}`;
const MONGO_URI =
  process.env.CONTRACT_MONGO_URI || 'mongodb://127.0.0.1:27017/legash_contract_test_db';
const SERVER_JS = path.resolve(__dirname, '..', 'server.js');
const COLLECTION = path.resolve(__dirname, '../../legash_docs/postman_collection.json');
const ENVIRONMENT = path.resolve(__dirname, '../../legash_docs/postman_environment.json');

async function waitForReady(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch (_) {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for Backend on ${BASE}`);
}

async function runNewman() {
  return new Promise((resolve, reject) => {
    newman.run(
      {
        collection: COLLECTION,
        environment: ENVIRONMENT,
        envVar: [{ key: 'baseUrl', value: BASE }],
        reporters: ['cli'],
      },
      (err, summary) => {
        if (err) return reject(err);
        const failures = summary.run.failures;
        if (failures && failures.length) {
          return reject(
            new Error(`${failures.length} contract assertion(s) failed against the Backend.`)
          );
        }
        resolve(summary);
      }
    );
  });
}

async function main() {
  // 1. Clean the throwaway contract DB so registration is deterministic.
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();

  // 2. Boot the real Backend with the throwaway DB on a dedicated port.
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), MONGO_URI },
    stdio: 'inherit',
  });

  let exitCode = 1;
  try {
    await waitForReady(30000);
    await runNewman();
    console.log('\nContract tests PASSED against the real Backend.');
    exitCode = 0;
  } catch (err) {
    console.error('\nContract tests FAILED:', err.message);
  } finally {
    child.kill('SIGTERM');
    await mongoose
      .connect(MONGO_URI)
      .then(async () => {
        await mongoose.connection.dropDatabase().catch(() => {});
        await mongoose.disconnect();
      })
      .catch(() => {});
  }
  process.exit(exitCode);
}

main();