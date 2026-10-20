const { admin, initFirebase } = require('../config/firebase');
const Donor = require('../models/Donor');

/**
 * Sends an urgent blood alert push notification to a donor's mobile device via FCM.
 *
 * Payload format conforms to Flutter mobile app (Mobile/lib/services/fcm_service.dart):
 * - notification: { title, body }
 * - data: { type: 'BLOOD_REQUEST', requestId, hospitalName, bloodType, quantityNeeded }
 *
 * If FCM reports that the token is invalid or no longer registered, the stale token
 * is cleaned up from the Donor record automatically.
 */
async function sendBloodAlert(pushToken, { requestId, hospitalName, bloodType, quantityNeeded, donorId }) {
  initFirebase();
  if (!pushToken || !admin.apps || !admin.apps.length) return null;

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

    const isStaleToken =
      error.code === 'messaging/registration-token-not-registered' ||
      error.code === 'messaging/invalid-registration-token' ||
      (error.message && (
        error.message.includes('registration-token-not-registered') ||
        error.message.includes('Requested entity was not found')
      ));

    if (isStaleToken && donorId) {
      try {
        await Donor.findByIdAndUpdate(donorId, { $unset: { pushToken: 1 } });
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[FCM PUSH] Unset stale push token for donor ${donorId}`);
        }
      } catch (cleanupErr) {
        console.error('[FCM PUSH] Error unsetting stale push token:', cleanupErr);
      }
    }

    return null;
  }
}

module.exports = { sendBloodAlert };
