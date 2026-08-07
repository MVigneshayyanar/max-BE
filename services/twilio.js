const twilio = require('twilio');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

let client;
try {
  client = twilio(accountSid, authToken);
} catch (e) {
  console.error('⚠️ Twilio client init failed:', e.message);
}

/**
 * Generate a random 6-digit OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP via Twilio SMS
 */
async function sendOTP(phone) {
  const code = generateOTP();

  // Store OTP in database (upsert to handle re-sends)
  await prisma.otpCode.upsert({
    where: { phone },
    update: { code, createdAt: new Date() },
    create: { phone, code },
  });

  if (!client) {
    console.warn('⚠️ Twilio client not initialized, OTP not sent:', code);
    return { success: true, message: 'OTP generated (SMS not sent - Twilio not configured)' };
  }

  try {
    await client.messages.create({
      body: `Your MAX My Bill verification code is: ${code}. Valid for 10 minutes.`,
      from: fromNumber,
      to: phone,
    });

    console.log(`📱 OTP sent to ${phone}`);
    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('❌ Twilio send error:', error.message);
    throw new Error('Failed to send OTP via SMS');
  }
}

/**
 * Verify OTP code
 */
async function verifyOTP(phone, code) {
  const record = await prisma.otpCode.findUnique({ where: { phone } });

  if (!record) {
    return { success: false, error: 'No OTP found. Please request a new one.' };
  }

  // Check expiry (10 minutes)
  const ageMs = Date.now() - new Date(record.createdAt).getTime();
  if (ageMs > 10 * 60 * 1000) {
    await prisma.otpCode.delete({ where: { phone } });
    return { success: false, error: 'OTP expired. Please request a new one.' };
  }

  if (record.code !== code) {
    return { success: false, error: 'Invalid OTP code.' };
  }

  // OTP is valid — clean up
  await prisma.otpCode.delete({ where: { phone } });

  return { success: true };
}

module.exports = { sendOTP, verifyOTP };
