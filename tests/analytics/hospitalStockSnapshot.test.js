const mongoose = require('mongoose');

jest.mock('node-cron', () => ({
  schedule: jest.fn((cronExpr, callback, options) => ({
    cronExpr,
    callback,
    options,
    stop: jest.fn()
  }))
}));

const cron = require('node-cron');
const Hospital = require('../../src/models/Hospital');
const HospitalStockSnapshot = require('../../src/models/HospitalStockSnapshot');
const { runSnapshot, start } = require('../../src/jobs/v2/snapshotHospitalStock');
const { VALID_BLOOD_TYPES } = require('../../src/utils/bloodCompatibility');
const { SNAPSHOT_CRON, SNAPSHOT_TIMEZONE } = require('../../src/utils/hospitalStockHelpers');

describe('HospitalStockSnapshot Model & Job Tests', () => {
  beforeEach(async () => {
    await HospitalStockSnapshot.deleteMany({});
    await Hospital.deleteMany({});
    jest.clearAllMocks();
  });

  describe('Model validation and indexes', () => {
    test('schema defines required indexes and no TTL index', async () => {
      await HospitalStockSnapshot.syncIndexes();
      const schemaIndexes = HospitalStockSnapshot.schema.indexes();

      const indexDefs = schemaIndexes.map(([def]) => def);
      expect(indexDefs).toContainEqual({ recordedAt: -1 });
      expect(indexDefs).toContainEqual({ bloodType: 1, recordedAt: -1 });
      expect(indexDefs).toContainEqual({ hospital: 1, recordedAt: -1 });

      // Verify no TTL index (expireAfterSeconds)
      const optionsWithTtl = schemaIndexes.filter(([, opts]) => opts && opts.expireAfterSeconds);
      expect(optionsWithTtl).toHaveLength(0);
    });

    test('valid snapshot document saves with versionKey: false and no timestamps', async () => {
      const hospitalId = new mongoose.Types.ObjectId();
      const recordedAt = new Date('2026-10-18T09:00:00.000Z');

      const doc = await HospitalStockSnapshot.create({
        hospital: hospitalId,
        bloodType: 'A+',
        availableUnits: 10,
        recordedAt
      });

      expect(doc._id).toBeDefined();
      expect(doc.__v).toBeUndefined();
      expect(doc.createdAt).toBeUndefined();
      expect(doc.updatedAt).toBeUndefined();
      expect(doc.availableUnits).toBe(10);
    });

    test('rejects invalid bloodType', async () => {
      const doc = new HospitalStockSnapshot({
        hospital: new mongoose.Types.ObjectId(),
        bloodType: 'INVALID',
        availableUnits: 5,
        recordedAt: new Date()
      });

      let err;
      try {
        await doc.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.bloodType).toBeDefined();
    });

    test('rejects negative availableUnits', async () => {
      const doc = new HospitalStockSnapshot({
        hospital: new mongoose.Types.ObjectId(),
        bloodType: 'O+',
        availableUnits: -1,
        recordedAt: new Date()
      });

      let err;
      try {
        await doc.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.availableUnits).toBeDefined();
    });

    test('rejects missing hospital reference', async () => {
      const doc = new HospitalStockSnapshot({
        bloodType: 'O+',
        availableUnits: 5,
        recordedAt: new Date()
      });

      let err;
      try {
        await doc.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.hospital).toBeDefined();
    });

    test('rejects missing recordedAt', async () => {
      const doc = new HospitalStockSnapshot({
        hospital: new mongoose.Types.ObjectId(),
        bloodType: 'O+',
        availableUnits: 5
      });

      let err;
      try {
        await doc.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.recordedAt).toBeDefined();
    });
  });

  describe('runSnapshot job execution', () => {
    test('returns zeros and inserts nothing when no eligible hospitals exist', async () => {
      const testDate = new Date('2026-10-18T09:00:00.000Z');
      const result = await runSnapshot({ now: testDate });

      expect(result).toEqual({
        recordedAt: testDate,
        hospitalCount: 0,
        rowCount: 0
      });

      const count = await HospitalStockSnapshot.countDocuments();
      expect(count).toBe(0);
    });

    test('writes 8 rows per eligible hospital (0 for missing types) and assigns injected recordedAt', async () => {
      // Approved hospital with partial stock
      const hosp1 = await Hospital.create({
        hospitalName: 'Approved Hospital 1',
        licenseNumber: 'HOSP-1',
        email: 'hosp1@legash.org',
        phone: '+251911000001',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        bloodStock: [
          { bloodType: 'A+', availableUnits: 12 },
          { bloodType: 'O-', availableUnits: 4 }
        ]
      });

      // Pending hospital (must be skipped)
      await Hospital.create({
        hospitalName: 'Pending Hospital',
        licenseNumber: 'HOSP-2',
        email: 'hosp2@legash.org',
        phone: '+251911000002',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'pending',
        bloodStock: [{ bloodType: 'A+', availableUnits: 100 }]
      });

      // Rejected hospital (must be skipped)
      await Hospital.create({
        hospitalName: 'Rejected Hospital',
        licenseNumber: 'HOSP-3',
        email: 'hosp3@legash.org',
        phone: '+251911000003',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'rejected',
        bloodStock: [{ bloodType: 'A+', availableUnits: 100 }]
      });

      // Soft-deleted hospital (must be skipped)
      await Hospital.create({
        hospitalName: 'Deleted Hospital',
        licenseNumber: 'HOSP-4',
        email: 'hosp4@legash.org',
        phone: '+251911000004',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        isDeleted: true,
        bloodStock: [{ bloodType: 'A+', availableUnits: 100 }]
      });

      const testDate = new Date('2026-10-18T09:00:00.000Z');
      const result = await runSnapshot({ now: testDate });

      expect(result.hospitalCount).toBe(1);
      expect(result.rowCount).toBe(8);

      const docs = await HospitalStockSnapshot.find({ hospital: hosp1._id });
      expect(docs).toHaveLength(8);

      // Verify every row received injected testDate
      docs.forEach((doc) => {
        expect(doc.recordedAt.toISOString()).toBe(testDate.toISOString());
      });

      const aPos = docs.find((d) => d.bloodType === 'A+');
      expect(aPos.availableUnits).toBe(12);

      const oNeg = docs.find((d) => d.bloodType === 'O-');
      expect(oNeg.availableUnits).toBe(4);

      const missingType = docs.find((d) => d.bloodType === 'B+');
      expect(missingType.availableUnits).toBe(0);
    });

    test('append-only: running for two different dates leaves the first run untouched and adds second set', async () => {
      const hosp = await Hospital.create({
        hospitalName: 'Test Hospital',
        licenseNumber: 'HOSP-RUN2',
        email: 'run2@legash.org',
        phone: '+251911000005',
        passwordHash: 'dummy',
        location: { coordinates: [38.74, 9.03] },
        verificationStatus: 'approved',
        bloodStock: [{ bloodType: 'A+', availableUnits: 10 }]
      });

      const date1 = new Date('2026-10-17T09:00:00.000Z');
      const date2 = new Date('2026-10-18T09:00:00.000Z');

      await runSnapshot({ now: date1 });
      const countAfterRun1 = await HospitalStockSnapshot.countDocuments();
      expect(countAfterRun1).toBe(8);

      // Modify hospital stock for second run
      hosp.bloodStock = [{ bloodType: 'A+', availableUnits: 25 }];
      await hosp.save();

      await runSnapshot({ now: date2 });
      const countAfterRun2 = await HospitalStockSnapshot.countDocuments();
      expect(countAfterRun2).toBe(16);

      const date1Docs = await HospitalStockSnapshot.find({ recordedAt: date1 });
      expect(date1Docs).toHaveLength(8);
      expect(date1Docs.find((d) => d.bloodType === 'A+').availableUnits).toBe(10);

      const date2Docs = await HospitalStockSnapshot.find({ recordedAt: date2 });
      expect(date2Docs).toHaveLength(8);
      expect(date2Docs.find((d) => d.bloodType === 'A+').availableUnits).toBe(25);
    });

    test('inserts everything past 1000-row batch size (e.g. 130 hospitals = 1040 rows)', async () => {
      const hospitals = [];
      for (let i = 0; i < 130; i++) {
        hospitals.push({
          hospitalName: `Batch Hospital ${i}`,
          licenseNumber: `LIC-BATCH-${i}`,
          email: `batch${i}@legash.org`,
          phone: `+25191100${String(i).padStart(4, '0')}`,
          passwordHash: 'dummy',
          location: { coordinates: [38.74, 9.03] },
          verificationStatus: 'approved',
          bloodStock: VALID_BLOOD_TYPES.map((bt) => ({ bloodType: bt, availableUnits: 2 }))
        });
      }
      await Hospital.insertMany(hospitals);

      const testDate = new Date('2026-10-18T09:00:00.000Z');
      const result = await runSnapshot({ now: testDate });

      expect(result.hospitalCount).toBe(130);
      expect(result.rowCount).toBe(1040);

      const totalInserted = await HospitalStockSnapshot.countDocuments({ recordedAt: testDate });
      expect(totalInserted).toBe(1040);
    });
  });

  describe('start() cron schedule & lifecycle', () => {
    let capturedCallback;

    test('schedules once with expected cron expression and Africa/Addis_Ababa timezone, and is idempotent', () => {
      const task = start();

      expect(cron.schedule).toHaveBeenCalledTimes(1);
      expect(cron.schedule).toHaveBeenCalledWith(SNAPSHOT_CRON, expect.any(Function), {
        timezone: SNAPSHOT_TIMEZONE
      });
      expect(task).toBeDefined();

      capturedCallback = cron.schedule.mock.calls[0][1];

      // Second start() returns same task without scheduling again
      const task2 = start();
      expect(task2).toBe(task);
      expect(cron.schedule).toHaveBeenCalledTimes(1);
    });

    test('error inside scheduled callback is caught and logged without throwing', async () => {
      expect(capturedCallback).toBeDefined();

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const findSpy = jest.spyOn(Hospital, 'find').mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(capturedCallback()).resolves.not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[HospitalStockSnapshot] Snapshot run failed:',
        'Database connection lost'
      );

      findSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('requiring module does no scheduling at require time', () => {
      jest.isolateModules(() => {
        const isolatedCron = require('node-cron');
        isolatedCron.schedule.mockClear();
        require('../../src/jobs/v2/snapshotHospitalStock');
        expect(isolatedCron.schedule).not.toHaveBeenCalled();
      });
    });
  });
});
