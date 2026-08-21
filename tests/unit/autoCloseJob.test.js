const mongoose = require('mongoose');
const BloodRequest = require('../../src/models/BloodRequest');
const startAutoCloseJob = require('../../src/jobs/autoCloseBloodRequests');
const { closeExpiredRequests } = startAutoCloseJob;

describe('Unit Tests: Auto Close Expired Blood Requests Background Job', () => {
  beforeEach(async () => {
    await BloodRequest.deleteMany({});
  });

  describe('startAutoCloseJob scheduling', () => {
    it('initializes and returns a cron task without throwing', () => {
      let task;
      expect(() => {
        task = startAutoCloseJob();
      }).not.toThrow();

      if (task && typeof task.stop === 'function') {
        task.stop();
      }
    });
  });

  describe('closeExpiredRequests execution', () => {
    it('closes requests past closesAt and leaves active/future requests open', async () => {
      const hospitalId = new mongoose.Types.ObjectId();
      const pastDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour in the future

      // 1. Open request past its closesAt date (should be closed)
      const expiredReq = await BloodRequest.create({
        hospital: hospitalId,
        bloodType: 'O+',
        quantityNeeded: 2,
        status: 'open',
        closesAt: pastDate,
      });

      // 2. Open request with closesAt in the future (should remain open)
      const futureReq = await BloodRequest.create({
        hospital: hospitalId,
        bloodType: 'A+',
        quantityNeeded: 1,
        status: 'open',
        closesAt: futureDate,
      });

      // 3. Already closed request (should not be overwritten)
      const manualClosedReq = await BloodRequest.create({
        hospital: hospitalId,
        bloodType: 'B+',
        quantityNeeded: 3,
        status: 'closed',
        closedReason: 'manual',
        closedAt: new Date(Date.now() - 5000),
        closesAt: pastDate,
      });

      const beforeRunTime = new Date();
      const result = await closeExpiredRequests();
      const afterRunTime = new Date();

      expect(result).toBeDefined();
      expect(result.modifiedCount).toBe(1);

      // Verify expired request was closed
      const updatedExpired = await BloodRequest.findById(expiredReq._id);
      expect(updatedExpired.status).toBe('closed');
      expect(updatedExpired.closedReason).toBe('expired');
      expect(updatedExpired.closedAt).toBeInstanceOf(Date);
      expect(updatedExpired.closedAt.getTime()).toBeGreaterThanOrEqual(beforeRunTime.getTime());
      expect(updatedExpired.closedAt.getTime()).toBeLessThanOrEqual(afterRunTime.getTime());

      // Verify future request remains open
      const updatedFuture = await BloodRequest.findById(futureReq._id);
      expect(updatedFuture.status).toBe('open');
      expect(updatedFuture.closedReason).toBeNull();
      expect(updatedFuture.closedAt).toBeNull();

      // Verify manually closed request was untouched
      const updatedManual = await BloodRequest.findById(manualClosedReq._id);
      expect(updatedManual.status).toBe('closed');
      expect(updatedManual.closedReason).toBe('manual');
    });

    it('handles runs when there are no expired requests gracefully', async () => {
      const result = await closeExpiredRequests();
      expect(result).toBeDefined();
      expect(result.modifiedCount).toBe(0);
    });
  });
});
