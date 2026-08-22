// Used by Hospital registration (verification email)
// and by the Hospital/Super Admin forgot-password flow (reset code email). Build once here;
// nobody else should write their own Nodemailer setup.
//
// Setup needed in .env: EMAIL_USER, EMAIL_APP_PASSWORD (a Gmail "App Password", not your
// real Gmail password — Google Account > Security > App Passwords, requires 2-Step
// Verification turned on first), EMAIL_FROM.

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendVerificationEmail(toEmail, code) {
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('example') || process.env.NODE_ENV === 'test') {
    console.log(`\n[EMAIL MOCK] Verification OTP email for ${toEmail}:`);
    console.log(`  Your Legash hospital verification code is: ${code}\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Your Legash Hospital Verification Code',
    html: `<p>Your 6-digit verification code is:</p>
           <h2>${code}</h2>
           <p>This code expires in 15 minutes.</p>`,
  });
}

async function sendPasswordResetEmail(toEmail, resetCode) {
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('example') || process.env.NODE_ENV === 'test') {
    console.log(`\n[EMAIL MOCK] Password reset email for ${toEmail}:`);
    console.log(`  Reset Code: ${resetCode}\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Your Legash password reset code',
    html: `<p>Your password reset code is:</p>
           <h2>${resetCode}</h2>
           <p>This code expires in 15 minutes.</p>`,
  });
}

async function sendApprovalEmail(toEmail) {
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('example')) {
    console.log(`\n[EMAIL MOCK] Approval email for ${toEmail}:`);
    console.log(`  Your Legash hospital account has been approved. You can now log in.\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Legash Hospital Account Approved',
    html: `<p>Your Legash hospital account has been approved. You can now log in.</p>`,
  });
}

async function sendRejectionEmail(toEmail, reason) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const appealLink = `${frontendUrl}/appeal?email=${encodeURIComponent(toEmail)}`;
  const reasonText = reason ? `\nReason: ${reason}` : '';

  if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('example') || process.env.NODE_ENV === 'test') {
    console.log(`\n[EMAIL MOCK] Rejection email for ${toEmail}:`);
    console.log(`  Your Legash hospital registration was not approved.${reasonText}`);
    console.log(`  You can submit an appeal or inquiry here: ${appealLink}\n`);
    return;
  }
  const reasonHtml = reason ? `<p><strong>Reason for rejection:</strong> ${reason}</p>` : '';
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Legash Hospital Registration Update',
    html: `<p>Your Legash hospital registration was not approved.</p>
           ${reasonHtml}
           <p>If you believe this was an error, you can submit an appeal or inquiry <a href="${appealLink}">here</a>.</p>
           <p>Appeal Page URL: <a href="${appealLink}">${appealLink}</a></p>`,
  });
}

async function sendAdminVerificationOtp(toEmail, otp) {
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('example')) {
    console.log(`\n[EMAIL MOCK] Admin OTP email for ${toEmail}:`);
    console.log(`  Your Legash Admin verification code is: ${otp}\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Your Legash Admin verification code',
    html: `<p>You have been added as an Admin to Legash.</p>
           <p>Your 6-digit verification code is:</p>
           <h2>${otp}</h2>
           <p>This code expires in 15 minutes.</p>`,
  });
}

async function sendAdminSetupEmail(toEmail, setupToken, permissions) {
  const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/setup?token=${setupToken}`;
  const isDevOrTest =
    !process.env.EMAIL_USER ||
    process.env.EMAIL_USER.includes('example') ||
    process.env.NODE_ENV === 'test';

  if (isDevOrTest) {
    console.log(`\n[EMAIL MOCK] Admin Setup Invitation sent to ${toEmail}:`);
    console.log(`  Permissions: ${JSON.stringify(permissions)}`);
    console.log(`  Setup Link: ${setupLink}\n`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Invitation to Join Legash Admin Portal',
    html: `<p>You have been invited as an Admin on Legash with permissions:</p>
           <ul>
             <li>Approve Hospitals: ${permissions.canApproveHospitals ? 'Yes' : 'No'}</li>
             <li>Post Events: ${permissions.canPostEvents ? 'Yes' : 'No'}</li>
           </ul>
           <p>Click the link below to set up your password:</p>
           <p><a href="${setupLink}">${setupLink}</a></p>`,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendAdminVerificationOtp,
  sendAdminSetupEmail,
};