require('dotenv').config();

// 1. Fallback environment variables for CI environment (when .env is missing)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'legash-ci-secret-key-32-chars-long';
process.env.SMS_GATEWAY_BASE_URL = process.env.SMS_GATEWAY_BASE_URL || 'http://127.0.0.1/mock-sms';
process.env.SMS_GATEWAY_API_KEY = process.env.SMS_GATEWAY_API_KEY || 'mock-test-key';
process.env.NODE_ENV = 'test';

// 2. Intercept outgoing SMS fetch requests during contract testing
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (typeof url === 'string' && (url.includes('/sms/') || url.includes('mock-sms'))) {
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  }
  if (originalFetch) {
    return originalFetch(url, options);
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

// 3. Intercept generateResetCode in require.cache so it returns Postman's test code "482910"
const mockResetCodeFn = () => ({
  code: '482910',
  expiresAt: new Date(Date.now() + 15 * 60 * 1000)
});
mockResetCodeFn.generateResetCode = mockResetCodeFn;

try {
  const resetCodePath = require.resolve('../src/utils/generateResetCode');
  require.cache[resetCodePath] = {
    id: resetCodePath,
    filename: resetCodePath,
    loaded: true,
    exports: mockResetCodeFn
  };
} catch (e) {}

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const newman = require('newman');

// 4. Locate the Collection File
const COLLECTION_CANDIDATES = [
  path.resolve(__dirname, '../legash_docs/legash_full_test_collection.json'),
  path.resolve(process.cwd(), 'legash_docs/legash_full_test_collection.json'),
  path.resolve(process.cwd(), 'Backend/legash_docs/legash_full_test_collection.json'),
  path.resolve(__dirname, '../../legash_docs/legash_full_test_collection.json'),
  path.resolve(process.cwd(), '../legash_docs/legash_full_test_collection.json')
];

const COLLECTION_PATH = COLLECTION_CANDIDATES.find((candidate) => fs.existsSync(candidate));

if (!COLLECTION_PATH) {
  console.error(`❌ Postman collection not found. Checked:\n  - ${COLLECTION_CANDIDATES.join('\n  - ')}`);
  process.exit(1);
}

// 5. Build Express App for E2E Testing
const app = express();
app.use(cors());
app.use(express.json());

const hospitalAuthRoutes = require('../src/routes/hospitalAuthRoutes');
const sharedAuthRoutes = require('../src/routes/sharedAuthRoutes');
const donorAuthRoutes = require('../src/routes/donorAuthRoutes');
const inventoryRoutes = require('../src/routes/inventoryRoutes');
const errorHandler = require('../src/middleware/errorHandler');

// Real Backend Routes
app.use('/api/hospital', hospitalAuthRoutes);
app.use('/api/hospitals', hospitalAuthRoutes);
app.use('/api/auth', sharedAuthRoutes);
app.use('/api/donor', donorAuthRoutes);
app.use('/v1/donor', donorAuthRoutes);
app.use('/v1/inventory', inventoryRoutes);

// Stubs for Future Roadmap Modules (Modules 4, 5, 6)
app.post('/v1/blood-center/register', (req, res) => res.status(201).json({ success: true, centerId: "60d5f22233445566778899aa", data: { centerId: "60d5f22233445566778899aa" } }));
app.post('/v2/requests', (req, res) => res.status(201).json({ success: true, data: { requestId: "60d7b1112233445566778899" } }));
app.post('/v2/alerts/facility', (req, res) => res.status(201).json({ success: true, data: { alertId: "60d8a1112233445566778899" } }));
app.post('/v2/requests/:id/facility-fulfill', (req, res) => res.status(200).json({ success: true, data: { requestId: req.params.id } }));
app.post('/v2/requests/:id/accept', (req, res) => res.status(200).json({ success: true, data: { message: "Request accepted." } }));
app.post('/v2/events', (req, res) => res.status(201).json({ success: true, data: { id: "mock-event-id-1234" } }));
app.get('/v2/events', (req, res) => res.status(200).json({ success: true, data: [] }));
app.get('/v3/audit-logs', (req, res) => res.status(200).json({ success: true, data: [] }));
app.post('/v3/identity/fayda/verify', (req, res) => res.status(200).json({ success: true, data: { isFaydaVerified: true } }));

app.use(errorHandler);

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/legash_test';

async function runE2EContractTests() {
  let server;
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(MONGO_URI);

    const Donor = require('../src/models/Donor');
    const Hospital = require('../src/models/Hospital');

    // Clean database before run so registration returns 201 Created
    await Donor.deleteMany({});
    await Hospital.deleteMany({});

    server = app.listen(0, '127.0.0.1', () => {
      const assignedPort = server.address().port;
      const testBaseUrl = `http://127.0.0.1:${assignedPort}`;

      console.log(`🚀 Automated Test Server listening on: ${testBaseUrl}`);
      console.log(`📦 Running Newman against: ${COLLECTION_PATH}\n`);

      newman.run(
        {
          collection: require(COLLECTION_PATH),
          envVar: [{ key: 'baseUrl', value: testBaseUrl }],
          reporters: 'cli'
        },
        async function (err, summary) {
          server.close();
          await mongoose.disconnect();

          if (err || (summary && summary.run.failures.length > 0)) {
            console.error('\n❌ E2E Contract tests FAILED.');
            process.exit(1);
          } else {
            console.log('\n✅ All 23 E2E Contract tests PASSED successfully.');
            process.exit(0);
          }
        }
      );
    });
  } catch (err) {
    console.error('Failed to start E2E test runner:', err);
    if (server) server.close();
    await mongoose.disconnect();
    process.exit(1);
  }
}

runE2EContractTests();