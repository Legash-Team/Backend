// Connects Mongoose to MongoDB (local for now, per MONGO_URI in .env — switching to Atlas
// later just means changing that one connection string, nothing here changes).

const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;