const mongoose = require('mongoose');
const Hospital = require('../../src/models/Hospital');
const Admin = require('../../src/models/Admin');
const superAdminController = require('../../src/controllers/superAdminController');
const emailService = require('../../src/services/emailService');
const requirePermission = require('../../src/middleware/requirePermission');

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((data) => {
    res.body = data;
    return res;
  });
  return res;
}

describe('Super Admin Controller Unit Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('listPendingHospitals', () => {
    it('returns only hospitals with verificationStatus: pending AND emailVerified: true', async () => {
      // 1. Pending and email verified (SHOULD be returned)
      const validPendingHospital = await Hospital.create({
        hospitalName: 'St. Paul Hospital',
        licenseNumber: 'LIC-1001',
        phone: '+251911111111',
        email: 'stpaul@example.com',
        passwordHash: 'hashed_password_1',
        location: {
          type: 'Point',
          coordinates: [38.7468, 9.0320] // [lng, lat]
        },
        emailVerified: true,
        verificationStatus: 'pending',
        agreedToTerms: true,
        resetCode: '123456',
        resetCodeExpiresAt: new Date(Date.now() + 60000)
      });

      // 2. Pending but email NOT verified (SHOULD NOT be returned)
      await Hospital.create({
        hospitalName: 'Unverified Email Hospital',
        licenseNumber: 'LIC-1002',
        phone: '+251911111112',
        email: 'unverified@example.com',
        passwordHash: 'hashed_password_2',
        location: {
          type: 'Point',
          coordinates: [38.7500, 9.0400]
        },
        emailVerified: false,
        verificationStatus: 'pending',
        agreedToTerms: true
      });

      // 3. Approved hospital (SHOULD NOT be returned)
      await Hospital.create({
        hospitalName: 'Approved Hospital',
        licenseNumber: 'LIC-1003',
        phone: '+251911111113',
        email: 'approved@example.com',
        passwordHash: 'hashed_password_3',
        location: {
          type: 'Point',
          coordinates: [38.7600, 9.0500]
        },
        emailVerified: true,
        verificationStatus: 'approved',
        agreedToTerms: true
      });

      // 4. Rejected hospital (SHOULD NOT be returned)
      await Hospital.create({
        hospitalName: 'Rejected Hospital',
        licenseNumber: 'LIC-1004',
        phone: '+251911111114',
        email: 'rejected@example.com',
        passwordHash: 'hashed_password_4',
        location: {
          type: 'Point',
          coordinates: [38.7700, 9.0600]
        },
        emailVerified: true,
        verificationStatus: 'rejected',
        agreedToTerms: true
      });

      const req = {};
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.listPendingHospitals(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body).toBeDefined();
      expect(res.body.success).toBe(true);
      expect(res.body.hospitals).toHaveLength(1);

      const returnedHospital = res.body.hospitals[0];
      expect(returnedHospital.id.toString()).toBe(validPendingHospital._id.toString());
      expect(returnedHospital.hospitalName).toBe('St. Paul Hospital');
      expect(returnedHospital.email).toBe('stpaul@example.com');
      expect(returnedHospital.phone).toBe('+251911111111');
      expect(returnedHospital.licenseNumber).toBe('LIC-1001');
      expect(returnedHospital.location).toEqual({ lat: 9.0320, lng: 38.7468 });
      expect(returnedHospital.registeredAt).toBeDefined();

      // Ensure sensitive fields are stripped
      expect(returnedHospital.passwordHash).toBeUndefined();
      expect(returnedHospital.resetCode).toBeUndefined();
      expect(returnedHospital.resetCodeExpiresAt).toBeUndefined();
      expect(returnedHospital.verificationToken).toBeUndefined();
    });
  });

  describe('approveHospital', () => {
    it('succeeds on a pending hospital fixture, updates status in DB, and sends approval email', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Pending Hospital for Approval',
        licenseNumber: 'LIC-2001',
        phone: '+251922222221',
        email: 'pending-approve@example.com',
        passwordHash: 'hashed_pw',
        location: { type: 'Point', coordinates: [38.74, 9.03] },
        emailVerified: true,
        verificationStatus: 'pending',
        agreedToTerms: true
      });

      const sendApprovalEmailSpy = jest.spyOn(emailService, 'sendApprovalEmail').mockResolvedValue();

      const req = { params: { id: hospital._id.toString() } };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.approveHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Hospital approved. They have been notified and can now log in.'
      });

      // Verify DB update
      const updatedHospital = await Hospital.findById(hospital._id);
      expect(updatedHospital.verificationStatus).toBe('approved');

      // Verify email service was called
      expect(sendApprovalEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendApprovalEmailSpy).toHaveBeenCalledWith(hospital.email);

      sendApprovalEmailSpy.mockRestore();
    });

    it('returns 400 and does not modify record when called on an already-approved hospital', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Already Approved Hospital',
        licenseNumber: 'LIC-2002',
        phone: '+251922222222',
        email: 'already-approved@example.com',
        passwordHash: 'hashed_pw',
        location: { type: 'Point', coordinates: [38.74, 9.03] },
        emailVerified: true,
        verificationStatus: 'approved',
        agreedToTerms: true
      });

      const sendApprovalEmailSpy = jest.spyOn(emailService, 'sendApprovalEmail').mockResolvedValue();

      const req = {
        params: { id: hospital._id.toString() },
        body: { rejectionReason: 'Does not meet requirements' }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.approveHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        error: 'This hospital is not pending approval.'
      });

      const dbHospital = await Hospital.findById(hospital._id);
      expect(dbHospital.verificationStatus).toBe('approved');
      expect(sendApprovalEmailSpy).not.toHaveBeenCalled();

      sendApprovalEmailSpy.mockRestore();
    });

    it('returns 400 when called on an already-rejected hospital', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Already Rejected Hospital',
        licenseNumber: 'LIC-2003',
        phone: '+251922222223',
        email: 'already-rejected@example.com',
        passwordHash: 'hashed_pw',
        location: { type: 'Point', coordinates: [38.74, 9.03] },
        emailVerified: true,
        verificationStatus: 'rejected',
        agreedToTerms: true
      });

      const req = {
        params: { id: hospital._id.toString() },
        body: { rejectionReason: 'Does not meet requirements' }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.approveHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        error: 'This hospital is not pending approval.'
      });
    });

    it('returns 400 when called with a non-existent ID', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const req = { params: { id: nonExistentId } };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.approveHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        error: 'This hospital is not pending approval.'
      });
    });
  });

  describe('rejectHospital', () => {
    it('succeeds on a pending hospital fixture, updates status in DB, and sends rejection email', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Pending Hospital for Rejection',
        licenseNumber: 'LIC-3001',
        phone: '+251933333331',
        email: 'pending-reject@example.com',
        passwordHash: 'hashed_pw',
        location: { type: 'Point', coordinates: [38.74, 9.03] },
        emailVerified: true,
        verificationStatus: 'pending',
        agreedToTerms: true
      });

      const sendRejectionEmailSpy = jest.spyOn(emailService, 'sendRejectionEmail').mockResolvedValue();

      const req = {
        params: { id: hospital._id.toString() },
        body: { reason: 'Does not meet requirements' }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.rejectHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body).toEqual({
        success: true,
        message: 'Hospital rejected. They have been notified.'
      });

      const updatedHospital = await Hospital.findById(hospital._id);
      expect(updatedHospital.verificationStatus).toBe('rejected');
      expect(updatedHospital.rejectionReason).toBe('Does not meet requirements');

      expect(sendRejectionEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendRejectionEmailSpy).toHaveBeenCalledWith(hospital.email, 'Does not meet requirements');

      sendRejectionEmailSpy.mockRestore();
    });

    it('returns 400 if rejection reason is missing for a pending hospital', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Pending Hospital No Reason',
        licenseNumber: 'LIC-3001-NR',
        phone: '+251933333335',
        email: 'pending-noreason@example.com',
        passwordHash: 'hashed_pw',
        location: { type: 'Point', coordinates: [38.74, 9.03] },
        emailVerified: true,
        verificationStatus: 'pending',
        agreedToTerms: true
      });

      const sendRejectionEmailSpy = jest.spyOn(emailService, 'sendRejectionEmail').mockResolvedValue();

      const req = {
        params: { id: hospital._id.toString() },
        body: {}
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.rejectHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        error: 'A rejection reason is required.'
      });

      expect(sendRejectionEmailSpy).not.toHaveBeenCalled();
      sendRejectionEmailSpy.mockRestore();
    });

    it('returns 400 on an already-rejected hospital fixture', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Rejected Hospital',
        licenseNumber: 'LIC-3002',
        phone: '+251933333332',
        email: 'already-rejected-2@example.com',
        passwordHash: 'hashed_pw',
        location: { type: 'Point', coordinates: [38.74, 9.03] },
        emailVerified: true,
        verificationStatus: 'rejected',
        agreedToTerms: true
      });

      const sendRejectionEmailSpy = jest.spyOn(emailService, 'sendRejectionEmail').mockResolvedValue();

      const req = {
        params: { id: hospital._id.toString() },
        body: { rejectionReason: 'Does not meet requirements' }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.rejectHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        error: 'This hospital is not pending approval.'
      });

      expect(sendRejectionEmailSpy).not.toHaveBeenCalled();
      sendRejectionEmailSpy.mockRestore();
    });

    it('returns 400 on an already-approved hospital fixture', async () => {
      const hospital = await Hospital.create({
        hospitalName: 'Approved Hospital for Reject',
        licenseNumber: 'LIC-3003',
        phone: '+251933333333',
        email: 'approved-reject@example.com',
        passwordHash: 'hashed_pw',
        location: { type: 'Point', coordinates: [38.74, 9.03] },
        emailVerified: true,
        verificationStatus: 'approved',
        agreedToTerms: true
      });

      const req = {
        params: { id: hospital._id.toString() },
        body: { rejectionReason: 'Does not meet requirements' }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.rejectHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        error: 'This hospital is not pending approval.'
      });
    });

    it('returns 400 on non-existent hospital id', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const req = {
        params: { id: nonExistentId },
        body: { rejectionReason: 'Does not meet requirements' }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.rejectHospital(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        error: 'This hospital is not pending approval.'
      });
    });
  });

  describe('createAdmin', () => {
    it('creates an admin with permissions object, sends verification OTP, and returns 201', async () => {
      const sendAdminOtpSpy = jest.spyOn(emailService, 'sendAdminVerificationOtp').mockResolvedValue();

      const req = {
        body: {
          name: 'Abebe Admin',
          email: 'abebe.admin@example.com',
          permissions: {
            canApproveHospitals: true,
            canPostEvents: false
          }
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.createAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body.success).toBe(true);
      expect(res.body.admin).toBeDefined();
      expect(res.body.admin.name).toBe('Abebe Admin');
      expect(res.body.admin.email).toBe('abebe.admin@example.com');
      expect(res.body.admin.emailVerified).toBe(false);
      expect(res.body.admin.permissions.canApproveHospitals).toBe(true);
      expect(res.body.admin.permissions.canPostEvents).toBe(false);

      // Verify DB record
      const dbAdmin = await Admin.findOne({ email: 'abebe.admin@example.com' });
      expect(dbAdmin).toBeDefined();
      expect(dbAdmin.verificationOtp).toHaveLength(6);
      expect(dbAdmin.emailVerified).toBe(false);
      expect(sendAdminOtpSpy).toHaveBeenCalledWith('abebe.admin@example.com', dbAdmin.verificationOtp);

      sendAdminOtpSpy.mockRestore();
    });

    it('creates an admin with role string "both"', async () => {
      const sendAdminOtpSpy = jest.spyOn(emailService, 'sendAdminVerificationOtp').mockResolvedValue();

      const req = {
        body: {
          name: 'Both Admin',
          email: 'both.admin@example.com',
          role: 'both'
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.createAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.body.admin.permissions.canApproveHospitals).toBe(true);
      expect(res.body.admin.permissions.canPostEvents).toBe(true);

      sendAdminOtpSpy.mockRestore();
    });

    it('returns 400 if name or email is missing', async () => {
      const req = {
        body: {
          email: 'missingname@example.com'
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.createAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Name and email are required.');
    });

    it('returns 400 if admin with email already exists', async () => {
      await Admin.create({
        name: 'Existing Admin',
        email: 'duplicate@example.com',
        permissions: { canApproveHospitals: true, canPostEvents: true }
      });

      const req = {
        body: {
          name: 'New Admin',
          email: 'duplicate@example.com'
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.createAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('An Admin with this email already exists.');
    });
  });

  describe('listAdmins', () => {
    it('returns all admins with sensitive fields excluded', async () => {
      await Admin.deleteMany({});
      await Admin.create({
        name: 'Admin 1',
        email: 'admin1@example.com',
        verificationOtp: '111111',
        passwordHash: 'secret_hash',
        permissions: { canApproveHospitals: true, canPostEvents: false }
      });
      await Admin.create({
        name: 'Admin 2',
        email: 'admin2@example.com',
        verificationOtp: '222222',
        permissions: { canApproveHospitals: false, canPostEvents: true }
      });

      const req = {};
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.listAdmins(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body).success;
      expect(res.body.admins).toHaveLength(2);

      res.body.admins.forEach(admin => {
        expect(admin.id).toBeDefined();
        expect(admin.name).toBeDefined();
        expect(admin.email).toBeDefined();
        expect(admin.permissions).toBeDefined();
        expect(admin.passwordHash).toBeUndefined();
        expect(admin.verificationOtp).toBeUndefined();
        expect(admin.verificationOtpExpiresAt).toBeUndefined();
      });
    });
  });

  describe('verifyAdminOtp', () => {
    it('verifies valid OTP and marks emailVerified to true', async () => {
      const admin = await Admin.create({
        name: 'Verify Admin',
        email: 'verify.admin@example.com',
        verificationOtp: '654321',
        verificationOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        emailVerified: false
      });

      const req = {
        body: {
          email: 'verify.admin@example.com',
          otp: '654321'
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.verifyAdminOtp(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Admin email verified successfully');

      const updated = await Admin.findById(admin._id);
      expect(updated.emailVerified).toBe(true);
      expect(updated.verificationOtp).toBeNull();
      expect(updated.verificationOtpExpiresAt).toBeNull();
    });

    it('returns 400 for incorrect OTP', async () => {
      await Admin.create({
        name: 'Wrong OTP Admin',
        email: 'wrongotp@example.com',
        verificationOtp: '123456',
        verificationOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        emailVerified: false
      });

      const req = {
        body: {
          email: 'wrongotp@example.com',
          otp: '999999'
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.verifyAdminOtp(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid or expired OTP.');
    });

    it('returns 400 for expired OTP', async () => {
      await Admin.create({
        name: 'Expired OTP Admin',
        email: 'expiredotp@example.com',
        verificationOtp: '123456',
        verificationOtpExpiresAt: new Date(Date.now() - 1000),
        emailVerified: false
      });

      const req = {
        body: {
          email: 'expiredotp@example.com',
          otp: '123456'
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.verifyAdminOtp(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid or expired OTP.');
    });

    it('returns 400 for non-existent admin email', async () => {
      const req = {
        body: {
          email: 'nonexistent@example.com',
          otp: '123456'
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      await superAdminController.verifyAdminOtp(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body).toEqual({
        success: false,
        error: 'Invalid email or OTP.'
      });
    });
  });

  describe('requirePermission Middleware', () => {
    it('allows superadmin regardless of specific permission', async () => {
      const req = { user: { role: 'superadmin', id: new mongoose.Types.ObjectId() } };
      const res = mockResponse();
      const next = jest.fn();

      const middleware = requirePermission('canApproveHospitals');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('allows admin when permission is true on req.user', async () => {
      const req = {
        user: {
          role: 'admin',
          id: new mongoose.Types.ObjectId(),
          permissions: { canPostEvents: true }
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      const middleware = requirePermission('canPostEvents');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('allows admin when permission is true in DB', async () => {
      const admin = await Admin.create({
        name: 'DB Permission Admin',
        email: 'dbperm@example.com',
        permissions: { canApproveHospitals: true, canPostEvents: false }
      });

      const req = {
        user: {
          role: 'admin',
          id: admin._id
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      const middleware = requirePermission('canApproveHospitals');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('blocks admin with 403 when permission is false', async () => {
      const admin = await Admin.create({
        name: 'No Permission Admin',
        email: 'noperm@example.com',
        permissions: { canApproveHospitals: false, canPostEvents: false }
      });

      const req = {
        user: {
          role: 'admin',
          id: admin._id
        }
      };
      const res = mockResponse();
      const next = jest.fn();

      const middleware = requirePermission('canApproveHospitals');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.body.success).toBe(false);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks non-admin roles (e.g. hospital) with 403', async () => {
      const req = { user: { role: 'hospital', id: new mongoose.Types.ObjectId() } };
      const res = mockResponse();
      const next = jest.fn();

      const middleware = requirePermission('canApproveHospitals');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks unauthenticated requests with 401', async () => {
      const req = {};
      const res = mockResponse();
      const next = jest.fn();

      const middleware = requirePermission('canApproveHospitals');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('emailService email functions', () => {
    it('executes sendApprovalEmail, sendRejectionEmail, and sendAdminVerificationOtp in dev mock mode without error', async () => {
      process.env.EMAIL_USER = 'mock@example.com';
      await expect(emailService.sendApprovalEmail('hospital@example.com')).resolves.not.toThrow();
      await expect(emailService.sendRejectionEmail('hospital@example.com', 'Reason here')).resolves.not.toThrow();
      await expect(emailService.sendAdminVerificationOtp('admin@example.com', '123456')).resolves.not.toThrow();
    });
  });
});
