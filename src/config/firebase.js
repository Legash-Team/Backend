const admin = require('firebase-admin');

function initFirebase() {
  if (admin.apps && admin.apps.length > 0) {
    return admin;
  }

  const rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawConfig || rawConfig.trim() === '') {
    if (process.env.NODE_ENV !== 'test') {
      console.log('[FIREBASE CONFIG] FIREBASE_SERVICE_ACCOUNT_JSON not set. Push notifications will be skipped.');
    }
    return admin;
  }

  try {
    const serviceAccount = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    if (process.env.NODE_ENV !== 'test') {
      console.log('[FIREBASE CONFIG] Firebase Admin SDK initialized successfully.');
    }
  } catch (error) {
    console.error('[FIREBASE CONFIG] Failed to initialize Firebase Admin SDK:', error.message);
  }

  return admin;
}

// Initialize on load
initFirebase();

module.exports = {
  admin,
  initFirebase,
};
