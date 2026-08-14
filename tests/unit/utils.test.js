// tests/unit/utils.test.js
const { hashPassword, comparePassword } = require('../../src/utils/hashPassword');
const generateToken = require('../../src/utils/generateToken');
const jwt = require('jsonwebtoken');

describe('Unit Tests: Auth Utilities', () => {
  test('hashPassword & comparePassword should hash and verify correctly', async () => {
    const rawPassword = 'StrongPassword123!';
    const hashed = await hashPassword(rawPassword);

    expect(hashed).not.toEqual(rawPassword);
    
    const isValid = await comparePassword(rawPassword, hashed);
    expect(isValid).toBe(true);

    const isInvalid = await comparePassword('WrongPassword!', hashed);
    expect(isInvalid).toBe(false);
  });

  test('generateToken should create valid JWT with payload', () => {
    const payload = { id: 'hospital_123', role: 'hospital' };
    const token = generateToken(payload);

    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.id).toEqual('hospital_123');
    expect(decoded.role).toEqual('hospital');
  });
});