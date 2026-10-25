const admin = require('firebase-admin');
let getApps, initializeApp, cert, getMessaging;

try {
  const appModule = require('firebase-admin/app');
  getApps = appModule.getApps;
  initializeApp = appModule.initializeApp;
  cert = appModule.cert;
} catch (e) {
  // Fallbacks if running in mock environment
}

try {
  const msgModule = require('firebase-admin/messaging');
  getMessaging = msgModule.getMessaging;
} catch (e) {
  // Fallbacks if running in mock environment
}

// Ensure backward compatibility for admin.apps and admin.messaging in Firebase Admin v13+
if (typeof admin.messaging !== 'function' && getMessaging) {
  try {
    admin.messaging = () => getMessaging();
  } catch (e) {
    // Ignore in mocked environments
  }
}

if (!admin.apps && getApps) {
  try {
    Object.defineProperty(admin, 'apps', {
      get() {
        return getApps();
      },
      configurable: true,
    });
  } catch (e) {
    // Ignore in mocked environments
  }
}

function initFirebase() {
  const apps = typeof getApps === 'function' ? getApps() : (admin.apps || []);
  if (apps && apps.length > 0) {
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
    if (typeof initializeApp === 'function') {
      initializeApp({
        credential: cert(serviceAccount),
      });
    } else if (typeof admin.initializeApp === 'function') {
      admin.initializeApp({
        credential: cert ? cert(serviceAccount) : serviceAccount,
      });
    }
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
