const admin = require('firebase-admin');
const path = require('path');

function parseServiceAccountJson(envVal) {
  if (!envVal) return null;
  try {
    return JSON.parse(envVal);
  } catch (_) {
    try {
      // Fix raw unescaped newlines or control characters inside JSON private_key string
      const sanitized = envVal.replace(/\r?\n/g, '\\n');
      return JSON.parse(sanitized);
    } catch (_) {
      return null;
    }
  }
}

function initializeFirebaseAdmin() {
  try {
    if (admin.apps.length > 0) return;

    // 1. Try FIREBASE_SERVICE_ACCOUNT_JSON env var (Railway)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || 'maxbillup',
        });
        console.log('✅ Firebase Admin SDK initialized from FIREBASE_SERVICE_ACCOUNT_JSON env');
        return;
      }
    }

    // 2. Try local firebase-service-account.json file
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
      path.join(__dirname, '..', 'firebase-service-account.json');

    try {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || 'maxbillup',
      });
      console.log('✅ Firebase Admin SDK initialized from local service account file');
      return;
    } catch (_) {}

    // 3. Fallback: Public Cert Verification mode via Project ID
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'maxbillup',
    });
    console.log('✅ Firebase Admin SDK initialized with Project ID fallback (token verification active)');

  } catch (error) {
    console.error('⚠️ Firebase Admin SDK init error:', error.message);
    // Initialize with fallback Project ID if cert parsing threw an error
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'maxbillup',
        });
        console.log('✅ Fallback Firebase Admin initialized after cert error');
      }
    } catch (_) {}
  }
}

module.exports = { initializeFirebaseAdmin };
