const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ Error: MONGO_URI or MONGODB_URI is not defined in your .env file.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB Atlas connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB Atlas connection failed:', err.message);
    if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
      console.error('👉 Hint: Check your Atlas username and password in .env.');
    } else if (err.message.includes('querySrv ENOTFOUND') || err.message.includes('ETIMEDOUT')) {
      console.error('👉 Hint: Check your Atlas IP Whitelist (Network Access in Atlas Dashboard).');
    }
    process.exit(1);
  }
}

module.exports = connectDB;