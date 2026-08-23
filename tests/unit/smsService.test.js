// Backend/tests/unit/smsService.test.js
const { sendBloodAlertSms } = require('../../src/services/smsService');

describe('SMS Service - sendBloodAlertSms Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should skip sending if phone number is not provided', async () => {
    await sendBloodAlertSms('', {
      hospitalName: 'Test Hospital',
      bloodType: 'A+',
      quantityNeeded: 2,
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should log mock SMS in test environment without throwing', async () => {
    process.env.NODE_ENV = 'test';
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await sendBloodAlertSms('+251912345678', {
      hospitalName: 'Tikur Anbessa',
      bloodType: 'O+',
      quantityNeeded: 2,
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SMS MOCK] Blood Alert SMS sent to +251912345678')
    );

    consoleLogSpy.mockRestore();
  });

  it('should call SMS gateway when credentials are configured in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_GATEWAY_BASE_URL = 'https://sms-gateway.test';
    process.env.SMS_GATEWAY_API_KEY = 'test_key';

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    await sendBloodAlertSms('+251912345678', {
      hospitalName: 'Tikur Anbessa',
      bloodType: 'B+',
      quantityNeeded: 1,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://sms-gateway.test/api/v1/sms/send',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: '+251912345678',
          message: 'Legash: Tikur Anbessa needs B+ blood. Open the app to respond.',
        }),
      })
    );
  });
});
