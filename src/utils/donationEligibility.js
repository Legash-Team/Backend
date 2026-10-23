const PAUSE_DAYS = 90;

function notifiableDonorFilter(now = new Date()) {
  const cutoffTime = now.getTime() - PAUSE_DAYS * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffTime);

  return {
    $or: [
      { lastDonatedAt: { $exists: false } },
      { lastDonatedAt: null },
      { lastDonatedAt: { $lte: cutoffDate } },
    ],
  };
}

module.exports = {
  PAUSE_DAYS,
  notifiableDonorFilter,
};