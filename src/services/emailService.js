// Backend/src/services/emailService.js
// Transactional email dispatch via Resend API (used for hospital verification, password reset, admin setup, etc.)

const { Resend } = require('resend');

let _resendClient = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.trim() : '';
  if (!apiKey) {
    return null;
  }
  if (!_resendClient) {
    _resendClient = new Resend(apiKey);
  }
  return _resendClient;
}

function getFrontendBaseUrl() {
  const url = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.trim().replace(/\/+$/, '') : '';
  if (!url && process.env.NODE_ENV !== 'test') {
    console.warn('[WARN] FRONTEND_URL environment variable is not defined. Email links will omit the base URL.');
  }
  return url;
}

function getFromEmail() {
  return process.env.EMAIL_FROM ? process.env.EMAIL_FROM.trim() : 'Legash Blood Network <onboarding@resend.dev>';
}

function isMockMode() {
  const client = getResendClient();
  return (
    !client ||
    !process.env.RESEND_API_KEY ||
    process.env.RESEND_API_KEY.includes('example') ||
    process.env.RESEND_API_KEY === 'mock' ||
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.EMAIL_USER && process.env.EMAIL_USER.includes('example'))
  );
}

async function sendVerificationEmail(toEmail, code) {
  console.log(`[AUTH] Verification OTP for ${toEmail}: ${code}`);

  if (isMockMode()) {
    console.log(`\n[EMAIL MOCK] Verification OTP email for ${toEmail}:`);
    console.log(`  Your Legash hospital verification code is: ${code}\n`);
    return { success: true, mock: true, code };
  }

  const frontendUrl = getFrontendBaseUrl();
  const verificationLink = frontendUrl
    ? `${frontendUrl}/verify-email?email=${encodeURIComponent(toEmail)}&code=${encodeURIComponent(code)}`
    : '';

  const linkHtml = verificationLink
    ? `<div style="text-align: center; margin: 24px 0;">
         <a href="${verificationLink}" style="display: inline-block; background-color: #C21838; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">Verify Email Directly</a>
       </div>`
    : '';

  const linkText = verificationLink ? `\n\nOr verify directly by clicking: ${verificationLink}` : '';

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: 'Your Legash Hospital Verification Code',
      text: `Welcome to Legash Blood Network!\n\nYour 6-digit hospital verification code is: ${code}${linkText}\n\nThis code expires in 15 minutes.`,
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #E5DFD7; border-radius: 12px;">
               <h2 style="color: #C21838; margin-top: 0;">Legash Blood Network</h2>
               <p style="font-size: 15px; color: #1B1410;">Thank you for registering your hospital. Your 6-digit verification code is:</p>
               <div style="background-color: #FAF7F2; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
                 <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1B1410;">${code}</span>
               </div>
               ${linkHtml}
               <p style="color: #6E6259; font-size: 12px; line-height: 1.5; margin-top: 20px; border-top: 1px solid #E5DFD7; padding-top: 12px;">
                 This code expires in 15 minutes. If you did not request this registration, please ignore this email.
               </p>
             </div>`,
    });

    if (error) {
      console.error(`[EMAIL ERROR] Failed sending verification email to ${toEmail}:`, error.message || error);
      return { success: false, error: error.message || error };
    }

    console.log(`[EMAIL] Verification email sent to ${toEmail}, id: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending verification email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendPasswordResetEmail(toEmail, resetCode) {
  console.log(`[AUTH] Password Reset Code for ${toEmail}: ${resetCode}`);

  if (isMockMode()) {
    console.log(`\n[EMAIL MOCK] Password reset email for ${toEmail}:`);
    console.log(`  Reset Code: ${resetCode}\n`);
    return { success: true, mock: true };
  }

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: 'Your Legash Password Reset Code',
      text: `Your Legash password reset code is: ${resetCode}\n\nThis code expires in 15 minutes. If you did not request this, please secure your account immediately.`,
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #C21838; margin-top: 0;">Legash Password Reset</h2>
               <p>Your password reset code is:</p>
               <div style="background-color: #FAF7F2; border-radius: 6px; padding: 12px; text-align: center; margin: 16px 0;">
                 <span style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1B1410;">${resetCode}</span>
               </div>
               <p style="color: #4A4038; font-size: 13px;">This code expires in 15 minutes. If you did not request this, please secure your account immediately.</p>
             </div>`,
    });

    if (error) {
      console.error(`[EMAIL ERROR] Failed sending reset email to ${toEmail}:`, error.message || error);
      return { success: false, error: error.message || error };
    }

    console.log(`[EMAIL] Password reset email sent to ${toEmail}, id: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending reset email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendApprovalEmail(toEmail) {
  if (isMockMode()) {
    console.log(`\n[EMAIL MOCK] Approval email for ${toEmail}:`);
    console.log(`  Your Legash hospital account has been approved. You can now log in.\n`);
    return { success: true, mock: true };
  }

  const frontendUrl = getFrontendBaseUrl();
  const loginLink = frontendUrl ? `${frontendUrl}/login` : '';
  const loginButtonHtml = loginLink
    ? `<p><a href="${loginLink}" style="display: inline-block; background-color: #C21838; color: #FFFFFF; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">Log In to Dashboard</a></p>`
    : `<p>Please log in via your Legash dashboard.</p>`;

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: 'Legash Hospital Account Approved',
      text: `Your Legash hospital account has been verified and approved by the Super Admin.${loginLink ? `\n\nLog in: ${loginLink}` : ''}`,
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #1F6F5C; margin-top: 0;">Account Approved</h2>
               <p>Your Legash hospital account has been verified and approved by the Super Admin.</p>
               <p>You can now access your hospital portal and manage blood requests:</p>
               ${loginButtonHtml}
             </div>`,
    });

    if (error) {
      console.error(`[EMAIL ERROR] Failed sending approval email to ${toEmail}:`, error.message || error);
      return { success: false, error: error.message || error };
    }

    console.log(`[EMAIL] Approval email sent to ${toEmail}, id: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending approval email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendRejectionEmail(toEmail, reason) {
  const frontendUrl = getFrontendBaseUrl();
  const appealLink = frontendUrl ? `${frontendUrl}/appeal?email=${encodeURIComponent(toEmail)}` : '';
  const reasonText = reason ? `\nReason: ${reason}` : '';

  if (isMockMode()) {
    console.log(`\n[EMAIL MOCK] Rejection email for ${toEmail}:`);
    console.log(`  Your Legash hospital registration was not approved.${reasonText}`);
    if (appealLink) console.log(`  You can submit an appeal or inquiry here: ${appealLink}\n`);
    return { success: true, mock: true };
  }

  const reasonHtml = reason ? `<p><strong>Reason for rejection:</strong> ${reason}</p>` : '';
  const appealHtml = appealLink
    ? `<p>If you believe this was an error or wish to submit updated credentials, you can submit an appeal or inquiry:</p>
       <p><a href="${appealLink}" style="display: inline-block; background-color: #1B1410; color: #FFFFFF; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">Submit Appeal</a></p>`
    : `<p>If you believe this was an error, please contact the administrator.</p>`;

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: 'Legash Hospital Registration Update',
      text: `Your Legash hospital registration was not approved.${reasonText}${appealLink ? `\n\nSubmit appeal: ${appealLink}` : ''}`,
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #C21838; margin-top: 0;">Registration Update</h2>
               <p>Your Legash hospital registration was not approved.</p>
               ${reasonHtml}
               ${appealHtml}
             </div>`,
    });

    if (error) {
      console.error(`[EMAIL ERROR] Failed sending rejection email to ${toEmail}:`, error.message || error);
      return { success: false, error: error.message || error };
    }

    console.log(`[EMAIL] Rejection email sent to ${toEmail}, id: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending rejection email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendAdminVerificationOtp(toEmail, otp) {
  console.log(`[AUTH] Admin Verification OTP for ${toEmail}: ${otp}`);

  if (isMockMode()) {
    console.log(`\n[EMAIL MOCK] Admin OTP email for ${toEmail}:`);
    console.log(`  Your Legash Admin verification code is: ${otp}\n`);
    return { success: true, mock: true };
  }

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: 'Your Legash Admin Verification Code',
      text: `You have been added as an Admin to Legash.\n\nYour 6-digit verification code is: ${otp}\n\nThis code expires in 15 minutes.`,
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

    if (error) {
      console.error(`[EMAIL ERROR] Failed sending admin verification OTP to ${toEmail}:`, error.message || error);
      return { success: false, error: error.message || error };
    }

    console.log(`[EMAIL] Admin verification OTP sent to ${toEmail}, id: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed sending admin verification OTP to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendAdminSetupEmail(toEmail, setupToken, permissions) {
  const frontendUrl = getFrontendBaseUrl();
  const setupLink = frontendUrl ? `${frontendUrl}/admin/setup?token=${setupToken}` : '';
  console.log(`[AUTH] Admin Setup Invitation for ${toEmail}: ${setupLink || `(Token: ${setupToken})`}`);

  if (isMockMode()) {
    console.log(`\n[EMAIL MOCK] Admin Setup Invitation sent to ${toEmail}:`);
    console.log(`  Permissions: ${JSON.stringify(permissions)}`);
    console.log(`  Setup Link: ${setupLink || `(Token: ${setupToken})`}\n`);
    return { success: true, mock: true };
  }

  const linkHtml = setupLink
    ? `<p>Click the link below to set up your password:</p>
       <p><a href="${setupLink}" style="display: inline-block; background-color: #C21838; color: #FFFFFF; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">Set Up Password</a></p>`
    : `<p>Use the following setup token to configure your password: <code>${setupToken}</code></p>`;

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: 'Invitation to Join Legash Admin Portal',
      text: `You have been invited as an Admin on Legash.\n\nPermissions:\n- Approve Hospitals: ${permissions?.canApproveHospitals ? 'Yes' : 'No'}\n- Post Events: ${permissions?.canPostEvents ? 'Yes' : 'No'}\n\n${setupLink ? `Set up password: ${setupLink}` : `Setup token: ${setupToken}`}`,
      html: `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #E5DFD7; border-radius: 8px;">
               <h2 style="color: #C21838; margin-top: 0;">Legash Admin Invitation</h2>
               <p>You have been invited as an Admin on Legash with the following permissions:</p>
               <ul>
                 <li>Approve Hospitals: ${permissions?.canApproveHospitals ? 'Yes' : 'No'}</li>
                 <li>Post Events: ${permissions?.canPostEvents ? 'Yes' : 'No'}</li>
               </ul>
               ${linkHtml}
             </div>`,
    });

    if (error) {
      console.error(`[EMAIL ERROR] Failed sending admin setup invitation to ${toEmail}:`, error.message || error);
      return { success: false, error: error.message || error };
    }

    console.log(`[EMAIL] Admin setup invitation sent to ${toEmail}, id: ${data?.id}`);
    return { success: true, messageId: data?.id };
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