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
    console.log(`\n💬 [SMS MOCK] OTP sent to ${phone}: ${code}\n`);
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
  const message = `Legash: ${hospitalName} needs ${bloodType} blood. Open the app to respond.`;
  
  if (process.env.NODE_ENV === 'test' || !process.env.SMS_GATEWAY_BASE_URL || process.env.SMS_GATEWAY_BASE_URL.includes('example')) {
    console.log(`\n💬 [SMS MOCK] Blood Alert SMS sent to ${phone}: ${message}\n`);
    return;
  }

  const response = await fetch(`${process.env.SMS_GATEWAY_BASE_URL}/api/v1/sms/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SMS_GATEWAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, message }),
  });
  if (!response.ok) {
    throw new Error(`SMS gateway error: ${response.status}`);
  }
}

module.exports = { sendOtp, verifyOtp, sendBloodAlertSms };
