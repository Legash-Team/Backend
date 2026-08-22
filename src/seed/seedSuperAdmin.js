// One-off script — NOT part of the running server.
// Run once with: npm run seed:superadmin
//
// Reads SUPERADMIN_NAME / SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD from .env, creates the one
// SuperAdmin document if it doesn't already exist. Safe to re-run — it won't create a
// duplicate. Use a real strong password in your local .env before running this, never a
// placeholder — it becomes a live login credential the moment this script runs.


require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const SuperAdmin = require('../models/SuperAdmin');
const { hashPassword } = require('../utils/hashPassword');

async function seedSuperAdmin() {
  await connectDB();

  const superAdminEmail = (process.env.SUPERADMIN_EMAIL || 'admin@legash.org').toLowerCase().trim();
  const superAdminName = process.env.SUPERADMIN_NAME || 'Super Administrator';
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD || 'SuperAdminSecurePass123!';

  const existing = await SuperAdmin.findOne({ email: superAdminEmail });
  if (existing) {
    console.log(`Super Admin already exists (${superAdminEmail}) — nothing to do.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(superAdminPassword);

  await SuperAdmin.create({
    name: superAdminName,
    email: superAdminEmail,
    passwordHash,
  });

  console.log(`\n========================================`);
  console.log(`ROOT SUPER ADMIN CREATED SUCCESSFULLY`);
  console.log(`========================================`);
  console.log(`Name:     ${superAdminName}`);
  console.log(`Email:    ${superAdminEmail}`);
  console.log(`Password: ${superAdminPassword}`);
  console.log(`========================================\n`);

  process.exit(0);
}

seedSuperAdmin().catch((err) => {
  console.error('Super Admin seeding failed:', err);
  process.exit(1);
});