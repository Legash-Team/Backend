// Backend/tests/unit/pushService.test.js
const admin = require('firebase-admin');
const Donor = require('../../src/models/Donor');
const { sendBloodAlert } = require('../../src/services/pushService');

// Mock firebase-admin completely
jest.mock('firebase-admin', () => {
  const mockSend = jest.fn();
  return {
    apps: [],
    messaging: jest.fn(() => ({
      send: mockSend,
    })),
    // Helper to control mock state in tests
    _mockSend: mockSend,
  };
});

// Mock Donor model for dead token cleanup tests
jest.mock('../../src/models/Donor', () => ({
  findByIdAndUpdate: jest.fn(),
}));

describe('Push Service - sendBloodAlert Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    admin.apps = []; // Reset apps state
  });

  it('should skip sending if pushToken is not provided', async () => {
    admin.apps = [{ name: '[DEFAULT]' }]; // Mock initialized state

    await sendBloodAlert('', {
      hospitalName: 'Test Hospital',
      bloodType: 'A+',
      quantityNeeded: 2,
    });

    expect(admin.messaging).not.toHaveBeenCalled();
  });

  it('should skip sending if Firebase Admin is not initialized', async () => {
    admin.apps = []; // Mock uninitialized state

    await sendBloodAlert('test-token-123', {
      hospitalName: 'Test Hospital',
      bloodType: 'A+',
      quantityNeeded: 2,
    });

    expect(admin.messaging).not.toHaveBeenCalled();
  });

  it('should successfully format payload and call admin.messaging().send when initialized', async () => {
    admin.apps = [{ name: '[DEFAULT]' }]; // Mock initialized state
    admin._mockSend.mockResolvedValue('message-id-123');

    const alertData = {
      requestId: '64f123456789abcdef012345',
      hospitalName: 'Tikur Anbessa Hospital',
      bloodType: 'O-',
      quantityNeeded: 3,
    };

    const result = await sendBloodAlert('test-token-123', alertData);

    expect(result).toBe('message-id-123');
    expect(admin.messaging).toHaveBeenCalled();
    expect(admin._mockSend).toHaveBeenCalledWith({
      token: 'test-token-123',
      notification: {
        title: 'Urgent Blood Request',
        body: 'Tikur Anbessa Hospital urgently needs O- blood. Tap to respond.',
      },
      data: {
        type: 'BLOOD_REQUEST',
        requestId: '64f123456789abcdef012345',
        hospitalName: 'Tikur Anbessa Hospital',
        bloodType: 'O-',
        quantityNeeded: '3',
      },
    });
  });

  it('should safely catch and log errors thrown by admin.messaging().send', async () => {
    admin.apps = [{ name: '[DEFAULT]' }]; // Mock initialized state
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    admin._mockSend.mockRejectedValue(new Error('FCM network failure'));

    const result = await sendBloodAlert('expired-token', {
      hospitalName: 'St. Paul Hospital',
      bloodType: 'AB+',
      quantityNeeded: 1,
    });

    expect(result).toBeNull();
    expect(admin._mockSend).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Firebase Push Error:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('should unset stale pushToken on Donor when FCM returns registration-token-not-registered', async () => {
    admin.apps = [{ name: '[DEFAULT]' }];
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const unregisteredError = new Error('The registration token is not registered');
    unregisteredError.code = 'messaging/registration-token-not-registered';
    admin._mockSend.mockRejectedValue(unregisteredError);

    Donor.findByIdAndUpdate.mockResolvedValue({});

    const result = await sendBloodAlert('dead-token', {
      hospitalName: 'St. Paul Hospital',
      bloodType: 'B+',
      quantityNeeded: 2,
      donorId: '64f000000000000000000001',
    });

    expect(result).toBeNull();
    expect(Donor.findByIdAndUpdate).toHaveBeenCalledWith('64f000000000000000000001', {
      $unset: { pushToken: 1 },
    });

    consoleErrorSpy.mockRestore();
  });

  it('should unset stale pushToken on Donor when FCM returns invalid-registration-token', async () => {
    admin.apps = [{ name: '[DEFAULT]' }];
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const invalidError = new Error('Invalid token');
    invalidError.code = 'messaging/invalid-registration-token';
    admin._mockSend.mockRejectedValue(invalidError);

    Donor.findByIdAndUpdate.mockResolvedValue({});

    await sendBloodAlert('invalid-token', {
      hospitalName: 'St. Paul Hospital',
      bloodType: 'B+',
      quantityNeeded: 2,
      donorId: '64f000000000000000000002',
    });

    expect(Donor.findByIdAndUpdate).toHaveBeenCalledWith('64f000000000000000000002', {
      $unset: { pushToken: 1 },
    });

    consoleErrorSpy.mockRestore();
  });
});
