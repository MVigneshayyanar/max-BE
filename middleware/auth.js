const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Middleware: Verify Firebase Auth ID token.
 * 
 * The Flutter app still uses Firebase Auth for login (Google Sign-In / Phone OTP).
 * On every API request, it sends the Firebase ID token as:
 *   Authorization: Bearer <firebase-id-token>
 * 
 * This middleware:
 * 1. Extracts & verifies the token using Firebase Admin SDK
 * 2. Loads the user record from PostgreSQL
 * 3. Attaches user & storeId to the request object
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (firebaseError) {
      console.error('Firebase token verification failed:', firebaseError.code);
      if (firebaseError.code === 'auth/id-token-expired') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    const firebaseUid = decodedToken.uid;

    // Load user from PostgreSQL
    let user = await prisma.user.findUnique({
      where: { firebaseUid },
      include: { store: true },
    });

    // Auto-create user record if it doesn't exist yet (first login)
    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseUid,
          email: decodedToken.email || null,
          phone: decodedToken.phone_number || null,
          displayName: decodedToken.name || null,
          role: 'Owner',
        },
        include: { store: true },
      });
      console.log(`📝 Auto-created user record for ${firebaseUid}`);
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    // Attach to request
    req.firebaseUid = firebaseUid;
    req.user = user;
    req.storeId = user.storeId;
    req.decodedToken = decodedToken;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware: Ensure user has a store.
 * Use this on routes that require a store context (products, sales, etc.)
 */
function requireStore(req, res, next) {
  if (!req.storeId) {
    return res.status(400).json({ 
      error: 'No store associated with this account. Complete onboarding first.',
      code: 'NO_STORE' 
    });
  }
  next();
}

/**
 * Middleware: Check if user has a specific permission.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Owner has all permissions
    if (user.role === 'Owner') return next();

    const permissions = user.permissions || {};
    if (permissions[permission] === true) return next();

    return res.status(403).json({ 
      error: 'Permission denied',
      required: permission 
    });
  };
}

/**
 * Middleware: Check if user is the store owner.
 */
function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== 'Owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

/**
 * Middleware: Check if user is the app admin (maxmybillapp@gmail.com)
 */
function requireAdmin(req, res, next) {
  const email = req.user?.email?.toLowerCase();
  if (email !== 'maxmybillapp@gmail.com') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { 
  authMiddleware, 
  requireStore, 
  requirePermission, 
  requireOwner,
  requireAdmin 
};
