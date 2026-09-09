const PRIMARY = '#b08d57';
const PRIMARY_DARK = '#8c6c3e';
const BG = '#f7f4ef';
const SURFACE = '#ffffff';
const TEXT = '#2e2416';
const MUTED = '#7a6b5d';
const BORDER = '#e6dfd4';

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${BG}; font-family: Arial, Helvetica, sans-serif; color: ${TEXT}; }
    .wrapper { width: 100%; padding: 24px 16px; }
    .card { max-width: 640px; margin: 0 auto; background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 18px rgba(30, 20, 6, 0.08); }
    .header { background: ${PRIMARY}; padding: 24px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.4px; }
    .body { padding: 28px 24px 24px; }
    .title { font-size: 18px; font-weight: 700; margin-bottom: 12px; color: ${TEXT}; }
    .text { font-size: 15px; line-height: 1.6; color: ${MUTED}; margin-bottom: 16px; }
    .otp-box { background: ${BG}; border: 1px dashed ${PRIMARY}; border-radius: 10px; padding: 16px; text-align: center; margin: 18px 0; }
    .otp-code { font-size: 32px; font-weight: 800; color: ${PRIMARY_DARK}; letter-spacing: 6px; }
    .otp-label { font-size: 12px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 1px; margin-top: 6px; }
    .footer { padding: 18px 24px; text-align: center; font-size: 12px; color: ${MUTED}; border-top: 1px solid ${BORDER}; background: #faf8f4; }
    .btn { display: inline-block; padding: 12px 20px; border-radius: 8px; background: ${PRIMARY}; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; }
    .info-box { background: ${BG}; border-left: 4px solid ${PRIMARY}; padding: 12px 14px; border-radius: 0 8px 8px 0; margin: 14px 0; font-size: 14px; color: ${TEXT}; }
    .label { font-weight: 700; color: ${TEXT}; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>ZCanopy</h1>
      </div>
      <div class="body">
        ${body}
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} ZCanopy. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function otpEmailHtml(payload: { otp: string; username?: string; ttlSeconds?: number; purpose?: string; email?: string }): string {
  const purpose = (payload.purpose || 'verification').replace(/-/g, ' ');
  const title = payload.username ? `Hi ${payload.username},` : 'Hello,';
  const expiryText = payload.ttlSeconds ? `This code expires in ${Math.round(payload.ttlSeconds / 60)} minute(s).` : 'This code is time-limited.';
  const intro = purpose === 'password reset'
    ? `Use this verification code to reset your password.`
    : `Use this verification code to complete your ${purpose}.`;

  const body = `
    <div class="title">${title}</div>
    <div class="text">${intro}</div>
    <div class="otp-box">
      <div class="otp-code">${payload.otp}</div>
      <div class="otp-label">Verification code</div>
    </div>
    <div class="text">${expiryText}</div>
    <div class="info-box">If you did not request this, please ignore this email or contact support if you have concerns.</div>
  `;

  return baseTemplate('ZCanopy Verification', body);
}

export function passwordResetEmailHtml(payload: { otp: string; username?: string; ttlSeconds?: number; email?: string }): string {
  const title = payload.username ? `Hi ${payload.username},` : 'Hello,';
  const expiryText = payload.ttlSeconds ? `This code expires in ${Math.round(payload.ttlSeconds / 60)} minute(s).` : 'This code is time-limited.';

  const body = `
    <div class="title">Reset your password</div>
    <div class="text">We received a request to reset your ZCanopy account password. Use the code below to proceed.</div>
    <div class="otp-box">
      <div class="otp-code">${payload.otp}</div>
      <div class="otp-label">Reset code</div>
    </div>
    <div class="text">${expiryText}</div>
    <div class="info-box">If you did not request a password reset, you can safely ignore this email. Your account will remain unchanged.</div>
  `;

  return baseTemplate('Reset your ZCanopy password', body);
}

export function passwordChangedEmailHtml(payload: { username?: string; email?: string }): string {
  const title = payload.username ? `Hi ${payload.username},` : 'Hello,';

  const body = `
    <div class="title">Your password was changed</div>
    <div class="text">This is a confirmation that your ZCanopy account password was successfully changed.</div>
    <div class="info-box">If you did not make this change, please reset your password immediately or contact our support team.</div>
  `;

  return baseTemplate('ZCanopy password updated', body);
}

export function adminAlertEmailHtml(payload: { subject?: string; message: string; recipientName?: string }): string {
  const title = payload.recipientName ? `Hi ${payload.recipientName},` : 'Admin Alert';

  const body = `
    <div class="title">${payload.subject || 'Important notification'}</div>
    <div class="text">${payload.message}</div>
    <div class="info-box">This message was sent from the ZCanopy admin panel. Please review and take action if needed.</div>
  `;

  return baseTemplate('ZCanopy admin notification', body);
}

export function brokerAccountCreatedEmailHtml(payload: { username: string; email: string; brokerCode: string }): string {
  const body = `
    <div class="title">Your broker account has been created</div>
    <div class="text">Welcome to ZCanopy, <span class="label">${payload.username}</span>. Your broker account has been created successfully.</div>
    <div class="info-box">
      <div><span class="label">Broker Code:</span> ${payload.brokerCode}</div>
    </div>
    <div class="text">Use this broker code when signing in to the broker dashboard. If you have any questions, reply to this email or contact support.</div>
  `;

  return baseTemplate('Welcome to ZCanopy', body);
}

export function brokerApprovalEmailHtml(payload: { username: string; email: string; brokerCode: string }): string {
  const body = `
    <div class="title">Your broker account has been approved</div>
    <div class="text">Congratulations <span class="label">${payload.username}</span>, your broker account has been approved.</div>
    <div class="info-box">
      <div><span class="label">Broker Code:</span> ${payload.brokerCode}</div>
    </div>
    <div class="text">You can now log in and start managing properties on ZCanopy.</div>
  `;

  return baseTemplate('ZCanopy broker approval', body);
}

export function paymentConfirmationEmailHtml(payload: { username?: string; email: string; invoice: { referenceNumber: string; transactionId: string; tier: string; amount: number; brokerCode: string; date: string; proofCode: string; }; }): string {
  const title = payload.username ? `Hi ${payload.username},` : 'Hello,';
  const { invoice } = payload;

  const body = `
    <div class="title">Payment confirmation</div>
    <div class="text">${title} Your payment for <span class="label">${invoice.tier}</span> subscription was successful.</div>
    <div class="info-box">
      <div><span class="label">Amount:</span> UGX ${invoice.amount.toLocaleString()}</div>
      <div><span class="label">Reference:</span> ${invoice.referenceNumber}</div>
      <div><span class="label">Transaction ID:</span> ${invoice.transactionId}</div>
      <div><span class="label">Broker Code:</span> ${invoice.brokerCode}</div>
      <div><span class="label">Date:</span> ${invoice.date}</div>
      <div><span class="label">Proof Code:</span> ${invoice.proofCode}</div>
    </div>
    <div class="text">Keep this email for your records. If you have any questions, contact our support team.</div>
  `;

  return baseTemplate('ZCanopy payment confirmation', body);
}

export function propertyPaymentConfirmationEmailHtml(payload: { username?: string; email: string; invoice: { customerPhone: string; customerName: string; amount: number; recipientPhone: string; recipientName: string; transactionCode: string; date: string; }; }): string {
  const title = payload.username ? `Hi ${payload.username},` : 'Hello,';
  const { invoice } = payload;

  const body = `
    <div class="title">Property payment confirmation</div>
    <div class="text">${title} Your property payment was successful.</div>
    <div class="info-box">
      <div><span class="label">Amount:</span> UGX ${invoice.amount.toLocaleString()}</div>
      <div><span class="label">Transaction Code:</span> ${invoice.transactionCode}</div>
      <div><span class="label">Date:</span> ${invoice.date}</div>
      <div><span class="label">Customer:</span> ${invoice.customerName} (${invoice.customerPhone})</div>
      <div><span class="label">Recipient:</span> ${invoice.recipientName} (${invoice.recipientPhone})</div>
    </div>
    <div class="text">Keep this email for your records. If you have any questions, contact our support team.</div>
  `;

  return baseTemplate('ZCanopy property payment confirmation', body);
}
