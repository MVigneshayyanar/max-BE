const admin = require('firebase-admin');
const path = require('path');

function initializeFirebaseAdmin() {
  try {
    // Try to use service account file
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
      path.join(__dirname, '..', 'firebase-service-account.json');
    
    // Check if running on Railway with env var
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.cert(require(serviceAccountPath)),
      });
    }
    console.log('✅ Firebase Admin SDK initialized');
  } catch (error) {
    console.error('⚠️ Firebase Admin SDK init failed:', error.message);
    console.error('   Make sure firebase-service-account.json exists or FIREBASE_SERVICE_ACCOUNT_JSON env is set');
    // Don't crash — some endpoints may work without it
  }
}

module.exports = { initializeFirebaseAdmin };
