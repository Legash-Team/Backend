// One-off script — NOT part of the running server.
// Run once with: npm run seed:superadmin
//
// Reads SUPERADMIN_NAME / SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD from .env, creates the one
// SuperAdmin document if it doesn't already exist. Safe to re-run — it won't create a
// duplicate. Use a real strong password in your local .env before running this, never a
// placeholder — it becomes a live login credential the moment this script runs.

require('dotenv').config();
const _mongoose = require('mongoose');
const connectDB = require('../config/db');
const SuperAdmin = require('../models/SuperAdmin');
const { hashPassword } = require('../utils/hashPassword');

async function seed() {
  await connectDB();

  const existing = await SuperAdmin.findOne({ email: process.env.SUPERADMIN_EMAIL });
  if (existing) {
    console.log('Super Admin already exists — nothing to do.');
    process.exit(0);
  }

  const passwordHash = await hashPassword(process.env.SUPERADMIN_PASSWORD);

  await SuperAdmin.create({
    name: process.env.SUPERADMIN_NAME,
    email: process.env.SUPERADMIN_EMAIL,
    passwordHash,
  });

  console.log(`Super Admin created: ${process.env.SUPERADMIN_EMAIL}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});