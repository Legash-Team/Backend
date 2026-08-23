const { admin, initFirebase } = require('../config/firebase');

async function sendBloodAlert(pushToken, { requestId, hospitalName, bloodType, quantityNeeded }) {
  initFirebase();
  if (!pushToken || !admin.apps || !admin.apps.length) return;

  const payload = {
    notification: {
      title: 'Urgent Blood Request',
      body: `${hospitalName} urgently needs ${bloodType} blood. Tap to respond.`,
    },
    data: {
      type: 'BLOOD_REQUEST',
      ...(requestId ? { requestId: String(requestId) } : {}),
      hospitalName: String(hospitalName || ''),
      bloodType: String(bloodType || ''),
      quantityNeeded: String(quantityNeeded || ''),
    },
  };

  try {
    const response = await admin.messaging().send({
      token: pushToken,
      ...payload,
    });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[FCM PUSH] Sent blood alert to token ${pushToken.slice(0, 10)}... (ID: ${response})`);
    }
    return response;
  } catch (error) {
    console.error('Firebase Push Error:', error);
  }
}

module.exports = { sendBloodAlert };
