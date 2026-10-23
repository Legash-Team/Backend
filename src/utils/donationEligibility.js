// Backend/src/utils/donationEligibility.js
const PAUSE_DAYS = 90;

/**
 * Returns a MongoDB query filter to match donors who are eligible to receive
 * notifications based on their last donation date.
 *
 * Rules:
 * - Donors with no recorded lastDonatedAt (or null) are eligible.
 * - Donors whose last donation is at least 90 days in the past are eligible.
 * - Donors who donated within the last 90 days are excluded.
 *
 * @param {Date} [now=new Date()]
 * @returns {object} MongoDB query condition
 */
function notifiableDonorFilter(now = new Date()) {
  const cutoffTime = now.getTime() - PAUSE_DAYS * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffTime);

  return {
    $or: [
      { lastDonatedAt: null },
      { lastDonatedAt: { $exists: false } },
      { lastDonatedAt: { $lte: cutoffDate } },
    ],
  };
}

module.exports = {
  PAUSE_DAYS,
  notifiableDonorFilter,
};
