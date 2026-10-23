// Backend/tests/email/emailService.test.js

const mockSendTransacEmail = jest.fn();

jest.mock('@getbrevo/brevo', () => {
  return {
    BrevoClient: jest.fn().mockImplementation(() => ({
      transactionalEmails: {
        sendTransacEmail: mockSendTransacEmail,
      },
    })),
  };
});

describe('emailService Unit Tests (Brevo)', () => {
  const originalEnv = process.env;
  let emailService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Clear require cache to re-instantiate with fresh environment
    jest.resetModules();
    emailService = require('../../src/services/emailService');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Mock Mode Fallback', () => {
    it('should operate in mock mode when in NODE_ENV=test without calling Brevo API', async () => {
      process.env.NODE_ENV = 'test';
      process.env.BREVO_API_KEY = 'valid-brevo-key';

      const res = await emailService.sendVerificationEmail('test@hospital.com', '123456');

      expect(res).toEqual({ success: true, mock: true, code: '123456' });
      expect(mockSendTransacEmail).not.toHaveBeenCalled();
    });

    it('should return mock result for password reset in mock mode', async () => {
      process.env.NODE_ENV = 'test';
      const res = await emailService.sendPasswordResetEmail('donor@example.com', '654321');
      expect(res).toEqual({ success: true, mock: true });
      expect(mockSendTransacEmail).not.toHaveBeenCalled();
    });

    it('should return mock result for approval email in mock mode', async () => {
      process.env.NODE_ENV = 'test';
      const res = await emailService.sendApprovalEmail('approved@hospital.com');
      expect(res).toEqual({ success: true, mock: true });
      expect(mockSendTransacEmail).not.toHaveBeenCalled();
    });

    it('should return mock result for rejection email in mock mode', async () => {
      process.env.NODE_ENV = 'test';
      const res = await emailService.sendRejectionEmail('rejected@hospital.com', 'Invalid license');
      expect(res).toEqual({ success: true, mock: true });
      expect(mockSendTransacEmail).not.toHaveBeenCalled();
    });

    it('should return mock result for admin OTP email in mock mode', async () => {
      process.env.NODE_ENV = 'test';
      const res = await emailService.sendAdminVerificationOtp('admin@legash.org', '998877');
      expect(res).toEqual({ success: true, mock: true });
      expect(mockSendTransacEmail).not.toHaveBeenCalled();
    });

    it('should return mock result for admin setup email in mock mode', async () => {
      process.env.NODE_ENV = 'test';
      const res = await emailService.sendAdminSetupEmail('admin@legash.org', 'token-123', {
        canApproveHospitals: true,
        canPostEvents: false,
      });
      expect(res).toEqual({ success: true, mock: true });
      expect(mockSendTransacEmail).not.toHaveBeenCalled();
    });
  });

  describe('Active Brevo Sending (Production / Dev with Key)', () => {
    beforeEach(() => {
      // Simulate non-test environment with valid Brevo configuration
      process.env.NODE_ENV = 'production';
      process.env.BREVO_API_KEY = 'real-brevo-api-key-test';
      process.env.EMAIL_FROM = 'Legash Alerts <alerts@legash.org>';
      process.env.FRONTEND_URL = 'https://legash.org';

      jest.resetModules();
      emailService = require('../../src/services/emailService');
    });

    it('should send verification email with correct Brevo payload and return messageId', async () => {
      mockSendTransacEmail.mockResolvedValueOnce({ messageId: 'msg-brevo-101' });

      const res = await emailService.sendVerificationEmail('hospital@example.com', '543210');

      expect(res).toEqual({ success: true, messageId: 'msg-brevo-101' });
      expect(mockSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: { name: 'Legash Alerts', email: 'alerts@legash.org' },
          to: [{ email: 'hospital@example.com' }],
          subject: 'Your Legash Hospital Verification Code',
          textContent: expect.stringContaining('543210'),
          htmlContent: expect.stringContaining('543210'),
        })
      );
    });

    it('should send password reset email with formatted template', async () => {
      mockSendTransacEmail.mockResolvedValueOnce({ messageId: 'msg-brevo-102' });

      const res = await emailService.sendPasswordResetEmail('donor@example.com', '789123');

      expect(res).toEqual({ success: true, messageId: 'msg-brevo-102' });
      expect(mockSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'donor@example.com' }],
          subject: 'Your Legash Password Reset Code',
          textContent: expect.stringContaining('789123'),
        })
      );
    });

    it('should send hospital approval email with login link', async () => {
      mockSendTransacEmail.mockResolvedValueOnce({ messageId: 'msg-brevo-103' });

      const res = await emailService.sendApprovalEmail('hospital@example.com');

      expect(res).toEqual({ success: true, messageId: 'msg-brevo-103' });
      expect(mockSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'hospital@example.com' }],
          subject: 'Legash Hospital Account Approved',
          textContent: expect.stringContaining('https://legash.org/login'),
        })
      );
    });

    it('should send rejection email with reason and appeal link', async () => {
      mockSendTransacEmail.mockResolvedValueOnce({ messageId: 'msg-brevo-104' });

      const res = await emailService.sendRejectionEmail('hospital@example.com', 'Unverifiable documents');

      expect(res).toEqual({ success: true, messageId: 'msg-brevo-104' });
      expect(mockSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'hospital@example.com' }],
          subject: 'Legash Hospital Registration Update',
          textContent: expect.stringContaining('Unverifiable documents'),
        })
      );
    });

    it('should send admin OTP verification email', async () => {
      mockSendTransacEmail.mockResolvedValueOnce({ messageId: 'msg-brevo-105' });

      const res = await emailService.sendAdminVerificationOtp('admin@legash.org', '112233');

      expect(res).toEqual({ success: true, messageId: 'msg-brevo-105' });
      expect(mockSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'admin@legash.org' }],
          subject: 'Your Legash Admin Verification Code',
          textContent: expect.stringContaining('112233'),
        })
      );
    });

    it('should send admin setup email with token and permissions', async () => {
      mockSendTransacEmail.mockResolvedValueOnce({ messageId: 'msg-brevo-106' });

      const res = await emailService.sendAdminSetupEmail('admin@legash.org', 'setup-tok-456', {
        canApproveHospitals: true,
        canPostEvents: true,
      });

      expect(res).toEqual({ success: true, messageId: 'msg-brevo-106' });
      expect(mockSendTransacEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: [{ email: 'admin@legash.org' }],
          subject: 'Invitation to Join Legash Admin Portal',
          textContent: expect.stringContaining('setup-tok-456'),
        })
      );
    });

    it('should safely handle Brevo API errors without crashing', async () => {
      mockSendTransacEmail.mockRejectedValueOnce(new Error('Brevo service unavailable'));

      const res = await emailService.sendVerificationEmail('hospital@example.com', '543210');

      expect(res).toEqual({ success: false, error: 'Brevo service unavailable' });
    });
  });
});
