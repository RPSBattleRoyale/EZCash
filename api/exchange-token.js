import { createClient } from '@supabase/supabase-js';
import admin from 'firebase-admin';

// Initialize Firebase Admin (if not already)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { firebaseToken } = req.body;
  if (!firebaseToken) return res.status(400).json({ error: 'Missing token' });

  try {
    // Verify the Firebase ID token
    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    const uid = decoded.uid;

    // Check if the user exists in Supabase, if not create them
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', uid)
      .single();

    if (error && error.code === 'PGRST116') {
      // User not found, create them
      await supabase
        .from('users')
        .insert({ id: uid, email: decoded.email, balance: 0 });
    }

    // Now generate a Supabase JWT with the Firebase UID as the subject
    // Use the SUPABASE_JWT_SECRET from your environment
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        sub: uid,
        role: 'authenticated',
      },
      process.env.SUPABASE_JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(200).json({ token });
  } catch (error) {
    console.error('Token exchange error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}
