const cron = require('node-cron');
const Hospital = require('../../models/Hospital');
const HospitalStockSnapshot = require('../../models/HospitalStockSnapshot');
const {
  buildStockMap,
  SNAPSHOT_CRON,
  SNAPSHOT_TIMEZONE
} = require('../../utils/hospitalStockHelpers');
const { VALID_BLOOD_TYPES } = require('../../utils/bloodCompatibility');

const BATCH_SIZE = 1000;
let scheduledTask = null;

async function runSnapshot({ now = new Date() } = {}) {
  const eligibleFilter = {
    verificationStatus: 'approved',
    isDeleted: { $ne: true }
  };

  const cursor = Hospital.find(eligibleFilter).select('bloodStock').lean().cursor();

  let hospitalCount = 0;
  let rowCount = 0;
  let batch = [];

  for await (const hospital of cursor) {
    hospitalCount += 1;
    const stockMap = buildStockMap(hospital.bloodStock);
    for (const bloodType of VALID_BLOOD_TYPES) {
      batch.push({
        hospital: hospital._id,
        bloodType,
        availableUnits: stockMap[bloodType] || 0,
        recordedAt: now
      });

      if (batch.length >= BATCH_SIZE) {
        await HospitalStockSnapshot.insertMany(batch);
        rowCount += batch.length;
        batch = [];
      }
    }
  }

  if (batch.length > 0) {
    await HospitalStockSnapshot.insertMany(batch);
    rowCount += batch.length;
    batch = [];
  }

  return { recordedAt: now, hospitalCount, rowCount };
}

function start() {
  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule(
    SNAPSHOT_CRON,
    async () => {
      try {
        const result = await runSnapshot();
        console.log(
          `[HospitalStockSnapshot] Snapshot run complete: ${result.rowCount} rows recorded across ${result.hospitalCount} hospitals at ${result.recordedAt.toISOString()}.`
        );
      } catch (err) {
        console.error('[HospitalStockSnapshot] Snapshot run failed:', err.message);
      }
    },
    {
      timezone: SNAPSHOT_TIMEZONE
    }
  );

  return scheduledTask;
}

module.exports = {
  start,
  runSnapshot
};
