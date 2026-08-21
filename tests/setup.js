// tests/setup.js
const mongoose = require('mongoose');

const TEST_MONGO_URI = 'mongodb://127.0.0.1:27017/legash_test_db';

beforeAll(async () => {
  process.env.MONGO_URI = TEST_MONGO_URI;
  process.env.JWT_SECRET = 'test_jwt_secret_key_12345';
  process.env.JWT_EXPIRES_IN = '24h';

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI);
  }
});

afterEach(async () => {
  // Clear test data after each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  // Drop test database and close connection
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
  await mongoose.disconnect();
});