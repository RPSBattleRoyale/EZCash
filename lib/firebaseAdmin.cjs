const admin = require('firebase-admin');

// If credential is missing, try to load it explicitly (shouldn't happen, but safe)
if (!admin.credential) {
  console.warn('admin.credential is undefined, attempting to load submodule...');
  try {
    const credential = require('firebase-admin/credential');
    admin.credential = credential;
  } catch (e) {
    console.error('Failed to load firebase-admin/credential:', e.message);
  }
}

if (!admin.apps || !admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!serviceAccount) throw new Error('Service account JSON is empty');

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    throw error;
  }
}

module.exports = admin;
