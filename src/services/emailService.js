// Backend/src/services/emailService.js
// Used by Hospital registration (verification email)
// and by the Hospital/Super Admin forgot-password flow (reset code email).

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 6000,
      greetingTimeout: 6000,
      socketTimeout: 8000,
      auth: {
        user: user.trim(),
        pass: pass.trim(),
      },
    });
  }

  return _transporter;
}

async function sendVerificationEmail(toEmail, code) {
  console.log(`[AUTH] Verification OTP for ${toEmail}: ${code}`);

  const transporter = getTransporter();
  const isMock =
    !transporter ||
    !process.env.EMAIL_USER ||
    process.env.EMAIL_USER.includes('example') ||
    process.env.NODE_ENV === 'test';

  if (isMock) {
    console.log(`\n[EMAIL MOCK] Verification OTP email for ${toEmail}:`);
    console.log(`  Your Legash hospital verification code is: ${code}\n`);
    return { success: true, mock: true };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: toEmail,
      subject: 'Your Legash Hospital Verification Code',
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #C21838; margin-top: 0;">Legash Blood Network</h2>
               <p>Your 6-digit hospital verification code is:</p>
               <div style="background-color: #FAF7F2; border-radius: 6px; padding: 12px; text-align: center; margin: 16px 0;">
                 <span style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1B1410;">${code}</span>
               </div>
               <p style="color: #4A4038; font-size: 13px;">This code expires in 15 minutes. If you did not request this, please ignore this email.</p>
             </div>`,
    });
    console.log(`[EMAIL] Verification email sent to ${toEmail}, messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending verification email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendPasswordResetEmail(toEmail, resetCode) {
  console.log(`[AUTH] Password Reset Code for ${toEmail}: ${resetCode}`);

  const transporter = getTransporter();
  const isMock =
    !transporter ||
    !process.env.EMAIL_USER ||
    process.env.EMAIL_USER.includes('example') ||
    process.env.NODE_ENV === 'test';

  if (isMock) {
    console.log(`\n[EMAIL MOCK] Password reset email for ${toEmail}:`);
    console.log(`  Reset Code: ${resetCode}\n`);
    return { success: true, mock: true };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: toEmail,
      subject: 'Your Legash Password Reset Code',
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #C21838; margin-top: 0;">Legash Password Reset</h2>
               <p>Your password reset code is:</p>
               <div style="background-color: #FAF7F2; border-radius: 6px; padding: 12px; text-align: center; margin: 16px 0;">
                 <span style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1B1410;">${resetCode}</span>
               </div>
               <p style="color: #4A4038; font-size: 13px;">This code expires in 15 minutes. If you did not request this, please secure your account immediately.</p>
             </div>`,
    });
    console.log(`[EMAIL] Password reset email sent to ${toEmail}, messageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending reset email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendApprovalEmail(toEmail) {
  const transporter = getTransporter();
  const isMock =
    !transporter ||
    !process.env.EMAIL_USER ||
    process.env.EMAIL_USER.includes('example') ||
    process.env.NODE_ENV === 'test';

  if (isMock) {
    console.log(`\n[EMAIL MOCK] Approval email for ${toEmail}:`);
    console.log(`  Your Legash hospital account has been approved. You can now log in.\n`);
    return { success: true, mock: true };
  }

  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const loginLink = `${frontendUrl}/login`;
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: toEmail,
      subject: 'Legash Hospital Account Approved',
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #1F6F5C; margin-top: 0;">Account Approved</h2>
               <p>Your Legash hospital account has been verified and approved by the Super Admin.</p>
               <p>You can now access your hospital portal and manage blood requests:</p>
               <p><a href="${loginLink}" style="display: inline-block; background-color: #C21838; color: #FFFFFF; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">Log In to Dashboard</a></p>
             </div>`,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending approval email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendRejectionEmail(toEmail, reason) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const appealLink = `${frontendUrl}/appeal?email=${encodeURIComponent(toEmail)}`;
  const reasonText = reason ? `\nReason: ${reason}` : '';

  const transporter = getTransporter();
  const isMock =
    !transporter ||
    !process.env.EMAIL_USER ||
    process.env.EMAIL_USER.includes('example') ||
    process.env.NODE_ENV === 'test';

  if (isMock) {
    console.log(`\n[EMAIL MOCK] Rejection email for ${toEmail}:`);
    console.log(`  Your Legash hospital registration was not approved.${reasonText}`);
    console.log(`  You can submit an appeal or inquiry here: ${appealLink}\n`);
    return { success: true, mock: true };
  }

  const reasonHtml = reason ? `<p><strong>Reason for rejection:</strong> ${reason}</p>` : '';
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: toEmail,
      subject: 'Legash Hospital Registration Update',
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #C21838; margin-top: 0;">Registration Update</h2>
               <p>Your Legash hospital registration was not approved.</p>
               ${reasonHtml}
               <p>If you believe this was an error or wish to submit updated credentials, you can submit an appeal or inquiry:</p>
               <p><a href="${appealLink}" style="display: inline-block; background-color: #1B1410; color: #FFFFFF; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">Submit Appeal</a></p>
             </div>`,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending rejection email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendAdminVerificationOtp(toEmail, otp) {
  console.log(`[AUTH] Admin Verification OTP for ${toEmail}: ${otp}`);

  const transporter = getTransporter();
  const isMock =
    !transporter ||
    !process.env.EMAIL_USER ||
    process.env.EMAIL_USER.includes('example') ||
    process.env.NODE_ENV === 'test';

  if (isMock) {
    console.log(`\n[EMAIL MOCK] Admin OTP email for ${toEmail}:`);
    console.log(`  Your Legash Admin verification code is: ${otp}\n`);
    return { success: true, mock: true };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: toEmail,
      subject: 'Your Legash Admin Verification Code',
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #C21838; margin-top: 0;">Legash Admin Portal</h2>
               <p>You have been added as an Admin to Legash.</p>
               <p>Your 6-digit verification code is:</p>
               <div style="background-color: #FAF7F2; border-radius: 6px; padding: 12px; text-align: center; margin: 16px 0;">
                 <span style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1B1410;">${otp}</span>
               </div>
               <p style="color: #4A4038; font-size: 13px;">This code expires in 15 minutes.</p>
             </div>`,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending admin verification OTP to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendAdminSetupEmail(toEmail, setupToken, permissions) {
  const setupLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/setup?token=${setupToken}`;
  console.log(`[AUTH] Admin Setup Invitation for ${toEmail}: ${setupLink}`);

  const transporter = getTransporter();
  const isMock =
    !transporter ||
    !process.env.EMAIL_USER ||
    process.env.EMAIL_USER.includes('example') ||
    process.env.NODE_ENV === 'test';

  if (isMock) {
    console.log(`\n[EMAIL MOCK] Admin Setup Invitation sent to ${toEmail}:`);
    console.log(`  Permissions: ${JSON.stringify(permissions)}`);
    console.log(`  Setup Link: ${setupLink}\n`);
    return { success: true, mock: true };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: toEmail,
      subject: 'Invitation to Join Legash Admin Portal',
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #C21838; margin-top: 0;">Legash Admin Invitation</h2>
               <p>You have been invited as an Admin on Legash with the following permissions:</p>
               <ul>
                 <li>Approve Hospitals: ${permissions?.canApproveHospitals ? 'Yes' : 'No'}</li>
                 <li>Post Events: ${permissions?.canPostEvents ? 'Yes' : 'No'}</li>
               </ul>
               <p>Click the link below to set up your password:</p>
               <p><a href="${setupLink}" style="display: inline-block; background-color: #C21838; color: #FFFFFF; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">Set Up Password</a></p>
             </div>`,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending admin setup invitation to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendAdminVerificationOtp,
  sendAdminSetupEmail,
};