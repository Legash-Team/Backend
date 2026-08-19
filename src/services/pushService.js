const admin = require('firebase-admin');

async function sendBloodAlert(pushToken, { hospitalName, bloodType, quantityNeeded }) {
  if (!pushToken) return;

  const payload = {
    notification: {
      title: 'Urgent Blood Request',
      body: `${hospitalName} urgently needs ${bloodType} blood. Tap to respond.`,
    },
    data: {
      type: 'BLOOD_REQUEST',
      hospitalName,
      bloodType,
      quantityNeeded: String(quantityNeeded),
    },
  };

  try {
    await admin.messaging().send({
      token: pushToken,
      ...payload
    });
  } catch (error) {
    console.error('Firebase Push Error:', error);
  }
}

module.exports = { sendBloodAlert };
