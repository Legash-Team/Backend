// forgot-password. Generates a short numeric code (like an OTP) plus its expiry timestamp.
// Caller is responsible for saving both fields on the relevant record (resetCode,
// resetCodeExpiresAt) and for delivering the code (SMS for donor, email for hospital/admin).

const crypto = require('crypto');

const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 15;

function generateResetCode() {
  // 6-digit numeric code, e.g. "042917"
  const code = crypto.randomInt(0, 1000000).toString().padStart(CODE_LENGTH, '0');
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);
  return { code, expiresAt };
}

module.exports = generateResetCode;