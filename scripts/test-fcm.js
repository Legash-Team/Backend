// Backend/scripts/test-fcm.js
require('dotenv').config();
const admin = require('firebase-admin');

if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: FIREBASE_SERVICE_ACCOUNT_JSON is missing from your .env file.');
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error.message);
  process.exit(1);
}

// Replace with a valid test token obtained from the mobile emulator/device
const testToken = process.argv[2];
if (!testToken) {
  console.log('\nUsage: node scripts/test-fcm.js <TEST_DEVICE_FCM_TOKEN>');
  process.exit(0);
}

const payload = {
  notification: {
    title: 'Test Notification',
    body: 'Hello! This is a test notification from the Legash Backend.',
  },
  data: {
    type: 'TEST_ALERT',
    timestamp: new Date().toISOString(),
  },
  token: testToken,
};

console.log(`Sending message to token: ${testToken}...`);
admin.messaging().send(payload)
  .then((response) => {
    console.log('Successfully sent message:', response);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error sending message:', error);
    process.exit(1);
  });
