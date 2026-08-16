import admin from 'firebase-admin';

if (!admin.apps.length) {
  // The service account JSON is stored as a string in Vercel environment variables
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
