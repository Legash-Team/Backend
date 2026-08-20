require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSMTP() {
  console.log('Testing SMTP connection with:');
  console.log('User:', process.env.EMAIL_USER);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  try {
    await transporter.verify();
    console.log('✅ SMTP Connection verified successfully! Credentials are valid.');
  } catch (error) {
    console.error('❌ SMTP Connection failed:', error.message);
  }
}

testSMTP();