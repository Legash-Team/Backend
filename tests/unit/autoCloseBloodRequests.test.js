const mongoose = require('mongoose');
const BloodRequest = require('../../src/models/BloodRequest');
const Hospital = require('../../src/models/Hospital');
const { closeExpiredRequests, startAutoCloseJob } = require('../../src/jobs/autoCloseBloodRequests');

describe('Auto-Close Blood Requests Unit Tests', () => {
  let hospitalId;

  beforeEach(async () => {
    await BloodRequest.deleteMany({});
    await Hospital.deleteMany({});

    const hospital = await Hospital.create({
      hospitalName: 'St. Paul Hospital',
      licenseNumber: 'LIC-PAUL-001',
      phone: '+251911223344',
      email: 'stpaul@legash.org',
      passwordHash: 'hashed_pw',
      location: { type: 'Point', coordinates: [38.75, 9.03] },
      emailVerified: true,
      verificationStatus: 'approved',
    });

    hospitalId = hospital._id;
  });

  it('closes expired open requests and sets status to closed with closedReason="auto-expired" and closedAt set', async () => {
    // 1. Seed expired open request (past closesAt)
    const pastRequest = await BloodRequest.create({
      hospital: hospitalId,
      bloodType: 'O+',
      quantityNeeded: 2,
      status: 'open',
      closesAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    });

    // 2. Seed future open request
    const futureRequest = await BloodRequest.create({
      hospital: hospitalId,
      bloodType: 'A+',
      quantityNeeded: 1,
      status: 'open',
      closesAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour in future
    });

    // 3. Seed already closed request
    const manualClosedRequest = await BloodRequest.create({
      hospital: hospitalId,
      bloodType: 'B+',
      quantityNeeded: 3,
      status: 'closed',
      closedReason: 'manual',
      closesAt: new Date(Date.now() - 5 * 60 * 1000),
      closedAt: new Date(Date.now() - 4 * 60 * 1000),
    });

    // 4. Call closeExpiredRequests()
    await closeExpiredRequests();

    // 5. Assertions
    const updatedPast = await BloodRequest.findById(pastRequest._id);
    expect(updatedPast.status).toBe('closed');
    expect(updatedPast.closedReason).toBe('auto-expired');
    expect(updatedPast.closedAt).toBeDefined();
    expect(updatedPast.closedAt).not.toBeNull();

    const updatedFuture = await BloodRequest.findById(futureRequest._id);
    expect(updatedFuture.status).toBe('open');
    expect(updatedFuture.closedReason).toBeNull();
    expect(updatedFuture.closedAt).toBeNull();

    const updatedManual = await BloodRequest.findById(manualClosedRequest._id);
    expect(updatedManual.status).toBe('closed');
    expect(updatedManual.closedReason).toBe('manual');
  });

  it('startAutoCloseJob initializes cron schedule without throwing', () => {
    expect(() => {
      const task = startAutoCloseJob();
      if (task && typeof task.stop === 'function') {
        task.stop();
      }
    }).not.toThrow();
  });
});
