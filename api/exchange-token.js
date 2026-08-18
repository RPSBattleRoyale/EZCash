import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  // The service account JSON is stored as a string in Vercel env
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Only server-side
);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { firebaseToken } = req.body;
  if (!firebaseToken) {
    return res.status(400).json({ error: 'Missing firebaseToken' });
  }

  try {
    // 1. Verify the Firebase ID token
    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    const uid = decoded.uid;
    const email = decoded.email;

    // 2. Check if user exists in Supabase, if not, create them
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id')
      .eq('id', uid)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      // User not found – create them
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: uid,
          email: email,
          balance: 0,
          first_withdrawal_done: false,
          email_verified: decoded.email_verified || false,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Failed to create user in Supabase:', insertError);
        return res.status(500).json({ error: 'Failed to create user' });
      }
    } else if (fetchError) {
      console.error('Error fetching user:', fetchError);
      return res.status(500).json({ error: 'Database error' });
    }

    // 3. Generate a Supabase JWT with the user's Firebase UID as the subject
    const supabaseJwt = jwt.sign(
      {
        sub: uid,                  // This becomes auth.uid() in RLS
        role: 'authenticated',     // Set the role
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
      },
      process.env.SUPABASE_JWT_SECRET,
      { algorithm: 'HS256' }
    );

    // 4. Return the token to the client
    return res.status(200).json({ token: supabaseJwt });
  } catch (error) {
    console.error('Exchange error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
}
