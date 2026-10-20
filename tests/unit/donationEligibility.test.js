// Backend/tests/unit/donationEligibility.test.js
const { notifiableDonorFilter, PAUSE_DAYS } = require('../../src/utils/donationEligibility');

describe('donationEligibility Utility', () => {
  it('defines PAUSE_DAYS as 90', () => {
    expect(PAUSE_DAYS).toBe(90);
  });

  it('builds a query matching donors without lastDonatedAt or with lastDonatedAt <= 90 days ago', () => {
    const fixedNow = new Date('2026-10-20T12:00:00.000Z');
    const filter = notifiableDonorFilter(fixedNow);

    expect(filter).toHaveProperty('$or');
    expect(filter.$or).toEqual([
      { lastDonatedAt: null },
      { lastDonatedAt: { $exists: false } },
      { lastDonatedAt: { $lte: new Date('2026-07-22T12:00:00.000Z') } },
    ]);
  });
});
