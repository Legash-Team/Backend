const cron = require('node-cron');
const BloodRequest = require('../models/BloodRequest');

function startAutoCloseJob() {
  cron.schedule('*/5 * * * *', async () => {
    const now = new Date();
    await BloodRequest.updateMany(
      { status: 'open', closesAt: { $lte: now } },
      { status: 'closed', closedReason: 'auto-expired', closedAt: now }
    );
  });
}

module.exports = startAutoCloseJob;
