// Backend/src/services/emailService.js
const nodemailer = require('nodemailer');

const isDevOrTest =
  !process.env.EMAIL_USER ||
  process.env.EMAIL_USER.includes('example') ||
  process.env.NODE_ENV === 'test';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendVerificationEmail(toEmail, code) {
  if (isDevOrTest) {
    console.log(`\n📧 [EMAIL MOCK] Verification Code for ${toEmail}: ${code}\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Verify your Legash account',
    html: `<p>Your email verification code is: <h2>${code}</h2></p>`,
  });
}

async function sendPasswordResetEmail(toEmail, resetCode) {
  if (isDevOrTest) {
    console.log(`\n📧 [EMAIL MOCK] Reset Code for ${toEmail}: ${resetCode}\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Your Legash password reset code',
    html: `<p>Your password reset code is: <h2>${resetCode}</h2></p>`,
  });
}

async function sendApprovalEmail(toEmail) {
  if (isDevOrTest) {
    console.log(`\n📧 [EMAIL MOCK] Approval Email sent to ${toEmail}: Hospital approved.\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Legash Hospital Account Approved',
    html: `<p>Your Legash hospital account has been approved by the Super Admin. You can now log in.</p>`,
  });
}

async function sendRejectionEmail(toEmail, reason) {
  const reasonText = reason || 'Documentation submitted could not be validated against national registry standards.';
  const feedbackLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/rejected-feedback?email=${encodeURIComponent(toEmail)}`;

  if (isDevOrTest) {
    console.log(`\n📧 [EMAIL MOCK] Rejection Email sent to ${toEmail}:`);
    console.log(`👉 Reason: ${reasonText}`);
    console.log(`👉 Appeal/Feedback Link: ${feedbackLink}\n`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Legash Hospital Registration Update',
    html: `<p>Your Legash hospital registration was not approved.</p>
           <p><strong>Reason:</strong> ${reasonText}</p>
           <p>You can submit an appeal or feedback to Super Admin here: <a href="${feedbackLink}">${feedbackLink}</a></p>`,
  });
}

async function sendAdminSetupEmail(toEmail, setupToken, permissions) {
  const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/setup?token=${setupToken}`;

  if (isDevOrTest) {
    console.log(`\n📧 [EMAIL MOCK] Admin Setup Invitation sent to ${toEmail}:`);
    console.log(`👉 Permissions: ${JSON.stringify(permissions)}`);
    console.log(`👉 Setup Link: ${setupLink}\n`);
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
  sendAdminSetupEmail,
};