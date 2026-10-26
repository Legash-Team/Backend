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

async function sendDonationThankYou(pushToken, { donationDate, nextEligibilityDate, donorId }) {
  initFirebase();
  if (!pushToken || !admin.apps || !admin.apps.length) return null;

  const dDate = new Date(donationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const eDate = new Date(nextEligibilityDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const payload = {
    notification: {
      title: 'Thank You for Donating Blood!',
      body: `Thank you for donating blood on ${dDate}. Your next eligibility date is ${eDate}. You will not receive new blood donation requests during this 90-day recovery period. Thank you for helping save lives.`,
    },
    data: {
      type: 'DONATION_RECORDED',
      donationDate: String(donationDate),
      nextEligibilityDate: String(nextEligibilityDate),
    },
  };

  try {
    const response = await admin.messaging().send({
      token: pushToken,
      ...payload,
    });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[FCM PUSH] Sent donation thank-you to token ${pushToken.slice(0, 10)}... (ID: ${response})`);
    }
    return response;
  } catch (error) {
    console.error('Firebase Push Error (Donation Thank-You):', error);
    return null;
  }
}

async function sendDidNotDonateEncouragement(pushToken, { hospitalName }) {
  initFirebase();
  if (!pushToken || !admin.apps || !admin.apps.length) return null;

  const hName = hospitalName || 'the hospital';
  const payload = {
    notification: {
      title: 'Thank You for Your Willingness to Help!',
      body: `Thank you for taking the time to respond to ${hName}. Even though you couldn't donate this time, your support means the world to us and we hope to see you another time!`,
    },
    data: {
      type: 'DID_NOT_DONATE_ENCOURAGEMENT',
    },
  };

  try {
    const response = await admin.messaging().send({
      token: pushToken,
      ...payload,
    });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[FCM PUSH] Sent encouraging did-not-donate notification to token ${pushToken.slice(0, 10)}... (ID: ${response})`);
    }
    return response;
  } catch (error) {
    console.error('Firebase Push Error (Did Not Donate):', error);
    return null;
  }
}

module.exports = { sendBloodAlert, sendDonationThankYou, sendDidNotDonateEncouragement };

