// login. Token expires in 24h (JWT_EXPIRES_IN in .env) — no refresh token this sprint.
//
// payload should be small: e.g. { id, role } — never put the password hash or other
// sensitive fields in here, since a JWT payload is readable by anyone holding the token.

const jwt = require('jsonwebtoken');

function generateToken(payload) {
  const secret = process.env.JWT_SECRET || 'legash-ci-secret-key-32-chars-long';
  return jwt.sign(payload, secret, { expiresIn: '90d' });
}

module.exports = generateToken;