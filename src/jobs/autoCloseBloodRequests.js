const cron = require('node-cron');
const BloodRequest = require('../models/BloodRequest');

async function closeExpiredRequests() {
  try {
    const now = new Date();
    const result = await BloodRequest.updateMany(
      { status: 'open', closesAt: { $lte: now } },
      { status: 'closed', closedReason: 'auto-expired', closedAt: now }
    );
    const count = result?.modifiedCount ?? result?.nModified ?? 0;
    console.log(`[AutoCloseJob] Closed ${count} expired blood requests.`);
    return result;
  } catch (error) {
    console.error('[AutoCloseJob] Error auto-closing blood requests:', error.message);
  }
}

function startAutoCloseJob() {
  return cron.schedule('*/5 * * * *', async () => {
    await closeExpiredRequests();
  });
}

startAutoCloseJob.startAutoCloseJob = startAutoCloseJob;
startAutoCloseJob.closeExpiredRequests = closeExpiredRequests;

module.exports = startAutoCloseJob;
module.exports.startAutoCloseJob = startAutoCloseJob;
module.exports.closeExpiredRequests = closeExpiredRequests;
