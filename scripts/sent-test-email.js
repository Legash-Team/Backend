require('dotenv').config();
const nodemailer = require('nodemailer');

const recipient = process.argv[2] || process.env.EMAIL_USER;

if (!recipient) {
  console.error('Please provide a recipient email. Example: node scripts/send-test-email.js your-email@gmail.com');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendTest() {
  console.log(`Sending live test email from: ${process.env.EMAIL_USER} -> to: ${recipient}...`);

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: recipient,
      subject: '🩸 Legash Blood Network - SMTP Verification Test',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #e53e3e;">Legash SMTP Live Test</h2>
          <p>Congratulations! Your Gmail SMTP connection is working.</p>
          <p>Timestamp: <strong>${new Date().toISOString()}</strong></p>
        </div>
      `,
    });

    console.log('✅ Email sent successfully! Message ID:', info.messageId);
    console.log(`👉 Check your inbox at: ${recipient}`);
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
  }
}

sendTest();