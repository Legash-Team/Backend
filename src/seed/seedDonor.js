require('dotenv').config();
const mongoose = require('mongoose');
const Donor = require('../models/Donor');
const { hashPassword } = require('../utils/hashPassword');

async function seedDonor() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/legash';
  
  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected for seeding donor...');

    const phone = '+251911234567';
    const plainPassword = 'Password123!';
    const passwordHash = await hashPassword(plainPassword);

    // Delete existing donor with this phone if any
    await Donor.deleteMany({ phone });

    // Create a pre-verified donor
    const donor = await Donor.create({
      name: 'Yared Tadesse',
      phone: phone,
      passwordHash: passwordHash,
      fin: 'ETH-8829-1029-4401',
      gender: 'male',
      bloodType: 'O-',
      location: {
        type: 'Point',
        coordinates: [38.7613, 9.0108]
      },
      agreedToTerms: true,
      phoneVerified: true // ★ Pre-verified so NO OTP is required
    });

    console.log('\n========================================');
    console.log('✅ TEST DONOR CREATED SUCCESSFULLY');
    console.log('========================================');
    console.log(`📱 Phone:    ${donor.phone}`);
    console.log(`🔑 Password: ${plainPassword}`);
    console.log(`🆔 Donor ID: ${donor._id}`);
    console.log(`✔️  Verified: ${donor.phoneVerified}`);
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDonor();