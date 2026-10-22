require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Donor = require('../src/models/Donor');
const { generateUniqueDonorShortId } = require('../src/utils/generateShortId');

async function runBackfill() {
  await connectDB();

  const query = {
    $or: [{ shortId: { $exists: false } }, { shortId: null }],
  };

  const totalMissing = await Donor.countDocuments(query);
  console.log(`[Backfill] Records missing shortId: ${totalMissing}`);

  if (totalMissing === 0) {
    console.log('[Backfill] All donors already have a shortId. Exiting.');
    await mongoose.disconnect();
    return;
  }

  let updatedCount = 0;
  let errorCount = 0;

  const cursor = Donor.find(query).cursor();

  for (let donor = await cursor.next(); donor != null; donor = await cursor.next()) {
    try {
      donor.shortId = await generateUniqueDonorShortId();
      await donor.save();
      updatedCount++;
      if (updatedCount % 100 === 0) {
        console.log(`[Backfill Progress] Updated ${updatedCount}/${totalMissing}...`);
      }
    } catch (err) {
      errorCount++;
      console.error(`[Backfill Error] Record ${donor._id} failed: ${err.message}`);
    }
  }

  console.log(`[Backfill Complete] Updated: ${updatedCount}, Failed: ${errorCount}`);
  await mongoose.disconnect();
}

runBackfill().catch((err) => {
  console.error('[Backfill Fatal]', err);
  process.exit(1);
});