const admin = require('firebase-admin');
const path = require('path');

function initializeFirebaseAdmin() {
  try {
    if (admin.apps.length > 0) return;

    // 1. Try FIREBASE_SERVICE_ACCOUNT_JSON env var (Railway)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || 'maxbillup',
      });
      console.log('✅ Firebase Admin SDK initialized from FIREBASE_SERVICE_ACCOUNT_JSON env');
      return;
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
    // Allows admin.auth().verifyIdToken(token) to verify user logins without requiring private key
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'maxbillup',
    });
    console.log('✅ Firebase Admin SDK initialized with Project ID fallback (token verification active)');

  } catch (error) {
    console.error('⚠️ Firebase Admin SDK init error:', error.message);
  }
}

module.exports = { initializeFirebaseAdmin };
