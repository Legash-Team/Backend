// Backend/tests/unit/pushService.test.js
const admin = require('firebase-admin');
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
      hospitalName: 'Tikur Anbessa Hospital',
      bloodType: 'O-',
      quantityNeeded: 3,
    };

    await sendBloodAlert('test-token-123', alertData);

    expect(admin.messaging).toHaveBeenCalled();
    expect(admin._mockSend).toHaveBeenCalledWith({
      token: 'test-token-123',
      notification: {
        title: 'Urgent Blood Request',
        body: 'Tikur Anbessa Hospital urgently needs O- blood. Tap to respond.',
      },
      data: {
        type: 'BLOOD_REQUEST',
        hospitalName: 'Tikur Anbessa Hospital',
        bloodType: 'O-',
        quantityNeeded: '3',
      },
    });
  });

  it('should safely catch and log errors thrown by admin.messaging().send', async () => {
    admin.apps = [{ name: '[DEFAULT]' }]; // Mock initialized state
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    admin._mockSend.mockRejectedValue(new Error('FCM token expired'));

    await sendBloodAlert('expired-token', {
      hospitalName: 'St. Paul Hospital',
      bloodType: 'AB+',
      quantityNeeded: 1,
    });

    expect(admin._mockSend).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Firebase Push Error:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
