const cron = require('node-cron');
const BloodRequest = require('../models/BloodRequest');

/**
 * Finds and closes any open BloodRequest whose closesAt date has passed.
 * Uses a single updateMany operation for efficiency.
 */
async function closeExpiredRequests() {
  try {
    const now = new Date();
    const result = await BloodRequest.updateMany(
      { status: 'open', closesAt: { $lte: now } },
      { status: 'closed', closedReason: 'expired', closedAt: now }
    );
    console.log(`[AutoCloseJob] Closed ${result.modifiedCount ?? 0} expired blood requests.`);
    return result;
  } catch (error) {
    console.error('[AutoCloseJob] Error auto-closing blood requests:', error.message);
  }
}

/**
 * Schedules the recurring background job to run every 5 minutes.
 */
function startAutoCloseJob() {
  return cron.schedule('*/5 * * * *', async () => {
    await closeExpiredRequests();
  });
}

startAutoCloseJob.startAutoCloseJob = startAutoCloseJob;
startAutoCloseJob.closeExpiredRequests = closeExpiredRequests;

module.exports = startAutoCloseJob;
