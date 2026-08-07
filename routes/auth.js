const router = require('express').Router();
const admin = require('firebase-admin');
const { authMiddleware } = require('../middleware/auth');
const { sendOTP, verifyOTP } = require('../services/twilio');

const prisma = require('../config/db');

// ─── POST /api/auth/register ─────────────────────
// Called after Firebase Auth signup to create user record in PostgreSQL
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const { email, phone, displayName } = req.body;
    
    // User already auto-created by auth middleware, update with extra info
    const user = await prisma.user.update({
      where: { firebaseUid: req.firebaseUid },
      data: {
        email: email || req.user.email,
        phone: phone || req.user.phone,
        displayName: displayName || req.user.displayName,
      },
      include: { store: true },
    });

    res.json({ success: true, user });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// ─── GET /api/auth/me ────────────────────────────
// Get current user profile + store + permissions
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUid },
      include: { store: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// ─── POST /api/auth/send-otp ─────────────────────
// Send Twilio OTP (replaces Cloud Function sendTwilioOtp)
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const result = await sendOTP(phone);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// ─── POST /api/auth/verify-otp ───────────────────
// Verify OTP and return Firebase custom token (replaces Cloud Function verifyTwilioOtp)
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone number and code are required' });
    }

    // Verify OTP against stored code
    const result = await verifyOTP(phone, code);
    if (!result.success) {
      return res.status(401).json({ error: result.error || 'Invalid OTP' });
    }

    // Get or create Firebase user by phone number
    let uid;
    try {
      const userRecord = await admin.auth().getUserByPhoneNumber(phone);
      uid = userRecord.uid;
    } catch (e) {
      // User doesn't exist, create one
      const newUser = await admin.auth().createUser({ phoneNumber: phone });
      uid = newUser.uid;
    }

    // Mint a Firebase custom token
    const customToken = await admin.auth().createCustomToken(uid);

    // Ensure user exists in PostgreSQL
    await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: { phone },
      create: {
        firebaseUid: uid,
        phone,
        role: 'Owner',
      },
    });

    res.json({ success: true, customToken });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// ─── PUT /api/auth/session ───────────────────────
// Update active session (for single-session enforcement)
router.put('/session', authMiddleware, async (req, res) => {
  try {
    const { sessionId, deviceId, deviceLabel } = req.body;

    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUid },
    });

    // Check if already active on this device
    if (user.activeDeviceId === deviceId && user.activeSessionId) {
      return res.json({
        activated: true,
        sessionId: user.activeSessionId,
      });
    }

    // Check if another session is active
    if (user.activeSessionId && user.activeDeviceId !== deviceId) {
      return res.json({
        activated: false,
        needsApproval: true,
        activeDeviceLabel: user.activeDeviceLabel,
      });
    }

    // No active session or same device - claim it
    const updated = await prisma.user.update({
      where: { firebaseUid: req.firebaseUid },
      data: {
        activeSessionId: sessionId,
        activeDeviceId: deviceId,
        activeDeviceLabel: deviceLabel,
        activeSessionUpdatedAt: new Date(),
      },
    });

    // Notify via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.firebaseUid}`).emit('session_changed', {
        activeSessionId: sessionId,
        activeDeviceId: deviceId,
      });
    }

    res.json({ activated: true, sessionId });
  } catch (error) {
    console.error('Session update error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// ─── POST /api/auth/force-takeover ───────────────
// Force take over session from another device
router.post('/force-takeover', authMiddleware, async (req, res) => {
  try {
    const { sessionId, deviceId, deviceLabel } = req.body;

    const updated = await prisma.user.update({
      where: { firebaseUid: req.firebaseUid },
      data: {
        activeSessionId: sessionId,
        activeDeviceId: deviceId,
        activeDeviceLabel: deviceLabel,
        activeSessionUpdatedAt: new Date(),
      },
    });

    // Notify old device via Socket.IO to sign out
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.firebaseUid}`).emit('session_changed', {
        activeSessionId: sessionId,
        activeDeviceId: deviceId,
      });
    }

    res.json({ activated: true, sessionId });
  } catch (error) {
    console.error('Force takeover error:', error);
    res.status(500).json({ error: 'Failed to take over session' });
  }
});

// ─── POST /api/auth/fcm-token ────────────────────
// Register FCM token
router.post('/fcm-token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    // Add token to user's array if not already present
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUid },
    });

    const tokens = user.fcmTokens || [];
    if (!tokens.includes(token)) {
      tokens.push(token);
      await prisma.user.update({
        where: { firebaseUid: req.firebaseUid },
        data: { fcmTokens: tokens },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('FCM token error:', error);
    res.status(500).json({ error: 'Failed to register FCM token' });
  }
});

// ─── DELETE /api/auth/fcm-token ──────────────────
router.delete('/fcm-token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUid },
    });

    const tokens = (user.fcmTokens || []).filter(t => t !== token);
    await prisma.user.update({
      where: { firebaseUid: req.firebaseUid },
      data: { fcmTokens: tokens },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('FCM token removal error:', error);
    res.status(500).json({ error: 'Failed to remove FCM token' });
  }
});

// ─── POST /api/auth/logout ───────────────────────
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await prisma.user.update({
      where: { firebaseUid: req.firebaseUid },
      data: {
        activeSessionId: null,
        activeDeviceId: null,
        activeDeviceLabel: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

module.exports = router;
