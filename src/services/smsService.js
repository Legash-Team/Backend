const Donor = require('../models/Donor');
const generateResetCode = require('../utils/generateResetCode');

const OTP_MESSAGE = (code) =>
  `Your Legash OTP is ${code}. It expires in 15 minutes.`;

async function sendOtp(phone) {
  const donor = await Donor.findOne({ phone });
  if (!donor) throw new Error('Donor not found for OTP.');

  const { code, expiresAt } = generateResetCode();
  donor.resetCode = code;
  donor.resetCodeExpiresAt = expiresAt;
  await donor.save();

  if (process.env.NODE_ENV === 'test' || !process.env.SMS_GATEWAY_BASE_URL || process.env.SMS_GATEWAY_BASE_URL.includes('example')) {
    console.log(`\n[SMS MOCK] OTP sent to ${phone}: ${code}\n`);
    return;
  }

  const response = await fetch(`${process.env.SMS_GATEWAY_BASE_URL}/api/v1/sms/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SMS_GATEWAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone,
      message: OTP_MESSAGE(code),
    }),
  });

  if (!response.ok) {
    throw new Error(`SMS gateway error: ${response.status}`);
  }
}

async function verifyOtp(phone, code) {
  const donor = await Donor.findOne({ phone });
  if (!donor || !donor.resetCode || donor.resetCode !== code) return false;
  if (!donor.resetCodeExpiresAt || donor.resetCodeExpiresAt < new Date()) return false;

  donor.resetCode = null;
  donor.resetCodeExpiresAt = null;
  await donor.save();
  return true;
}

async function sendBloodAlertSms(phone, { hospitalName, bloodType, quantityNeeded }) {
  if (!phone) return;
  const message = `Legash: ${hospitalName} needs ${bloodType} blood. Open the app to respond.`;
  
  if (process.env.NODE_ENV === 'test' || !process.env.SMS_GATEWAY_BASE_URL || process.env.SMS_GATEWAY_BASE_URL.includes('example')) {
    console.log(`\n[SMS MOCK] Blood Alert SMS sent to ${phone}: ${message}\n`);
    return;
  }

  try {
    const response = await fetch(`${process.env.SMS_GATEWAY_BASE_URL}/api/v1/sms/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMS_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, message }),
    });
    if (!response.ok) {
      console.error(`SMS gateway error for ${phone}: ${response.status}`);
    } else if (process.env.NODE_ENV !== 'test') {
      console.log(`[SMS ALERT] Blood alert SMS sent to ${phone}`);
    }
  } catch (error) {
    console.error(`SMS dispatch error for ${phone}:`, error.message);
  }
}

async function sendDonationThankYouSms(phone, { donationDate, nextEligibilityDate }) {
  if (!phone) return;
  const dDate = new Date(donationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const eDate = new Date(nextEligibilityDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const message = `Thank you for donating blood on ${dDate}. Your next eligibility date is ${eDate}. You will not receive new blood donation requests during this 90-day recovery period. Thank you for helping save lives.`;

  if (process.env.NODE_ENV === 'test' || !process.env.SMS_GATEWAY_BASE_URL || process.env.SMS_GATEWAY_BASE_URL.includes('example')) {
    console.log(`\n[SMS MOCK] Donation Thank-You sent to ${phone}: ${message}\n`);
    return;
  }

  try {
    const response = await fetch(`${process.env.SMS_GATEWAY_BASE_URL}/api/v1/sms/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMS_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, message }),
    });
    if (!response.ok) {
      console.error(`SMS gateway error for ${phone}: ${response.status}`);
    } else if (process.env.NODE_ENV !== 'test') {
      console.log(`[SMS ALERT] Donation thank-you SMS sent to ${phone}`);
    }
  } catch (error) {
    console.error(`SMS dispatch error for ${phone}:`, error.message);
  }
}

async function sendDidNotDonateEncouragementSms(phone, { hospitalName }) {
  if (!phone) return;
  const hName = hospitalName || 'the hospital';
  const message = `Legash: Thank you for responding to ${hName}. Even though you couldn't donate this time, your willingness to help is deeply appreciated and we hope to see you another time!`;

  if (process.env.NODE_ENV === 'test' || !process.env.SMS_GATEWAY_BASE_URL || process.env.SMS_GATEWAY_BASE_URL.includes('example')) {
    console.log(`\n[SMS MOCK] Did Not Donate Encouragement sent to ${phone}: ${message}\n`);
    return;
  }

  try {
    const response = await fetch(`${process.env.SMS_GATEWAY_BASE_URL}/api/v1/sms/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SMS_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, message }),
    });
    if (!response.ok) {
      console.error(`SMS gateway error for ${phone}: ${response.status}`);
    } else if (process.env.NODE_ENV !== 'test') {
      console.log(`[SMS ALERT] Did Not Donate Encouragement SMS sent to ${phone}`);
    }
  } catch (error) {
    console.error(`SMS dispatch error for ${phone}:`, error.message);
  }
}

module.exports = { sendOtp, verifyOtp, sendBloodAlertSms, sendDonationThankYouSms, sendDidNotDonateEncouragementSms };

