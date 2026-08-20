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

async function sendVerificationEmail(toEmail, verificationLink) {
  if (isDevOrTest) {
    console.log(`\n📧 [EMAIL MOCK] Verification Email for ${toEmail}:`);
    console.log(`👉 Link: ${verificationLink}\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Verify your Legash account',
    html: `<p>Click the link below to verify your account:</p>
           <p><a href="${verificationLink}">${verificationLink}</a></p>`,
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
    console.log(`\n📧 [EMAIL MOCK] Approval email for ${toEmail}:`);
    console.log(`👉 Your Legash hospital account has been approved. You can now log in.\n`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Legash Hospital Account Approved',
    html: `<p>Your Legash hospital account has been approved. You can now log in.</p>`,
  });
}

async function sendRejectionEmail(toEmail, reason) {
  const reasonText = reason || 'Documentation submitted could not be validated against national registry standards.';
  const feedbackLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/feedback?email=${encodeURIComponent(toEmail)}`;

  if (isDevOrTest) {
    console.log(`\n📧 [EMAIL MOCK] Rejection email for ${toEmail}:`);
    console.log(`👉 Your Legash hospital registration was not approved. Reason: ${reasonText}`);
    console.log(`👉 You can submit an appeal or contact support.\n`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Legash Hospital Registration Update',
    html: `<p>Your Legash hospital registration was not approved.</p>
           <p><strong>Reason:</strong> ${reasonText}</p>
           <p>Submit feedback or appeal: <a href="${feedbackLink}">${feedbackLink}</a></p>`,
  });
}

async function sendAdminInvitationEmail(toEmail, invitationLink, permissions) {
  const permList = Array.isArray(permissions) ? permissions.join(', ') : permissions;

  if (isDevOrTest) {
    console.log(`\n📧 [EMAIL MOCK] Sub-Admin Invitation for ${toEmail}:`);
    console.log(`👉 Permissions: ${permList}`);
    console.log(`👉 Invitation Link: ${invitationLink}\n`);
    return;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: toEmail,
    subject: 'Invitation to Join Legash Admin Portal',
    html: `<p>You have been invited to join Legash with permissions: <strong>${permList}</strong></p>
           <p>Set up your password: <a href="${invitationLink}">${invitationLink}</a></p>`,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendAdminInvitationEmail,
};