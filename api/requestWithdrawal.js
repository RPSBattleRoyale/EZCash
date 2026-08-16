import admin from '../lib/firebaseAdmin.js';

const db = admin.firestore();

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- AUTH: Verify Firebase ID Token ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }

  const uid = decodedToken.uid;
  const { amount, paypalEmail } = req.body;

  // --- VALIDATE INPUT ---
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }
  if (!paypalEmail || !paypalEmail.includes('@')) {
    return res.status(400).json({ error: 'Valid PayPal email is required' });
  }

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = userSnap.data();

    // --- CHECK VERIFICATION ---
    if (!userData.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before withdrawing.' });
    }

    // --- MINIMUM WITHDRAWAL ---
    const firstWithdrawalDone = userData.firstWithdrawalDone || false;
    const minAmount = firstWithdrawalDone ? 1 : 5;
    if (amount < minAmount) {
      return res.status(400).json({ error: `Minimum withdrawal is $${minAmount}.` });
    }

    // --- INSUFFICIENT FUNDS ---
    if (amount > (userData.balance || 0)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // --- PROCESS WITHDRAWAL ---
    const userRef = db.collection('users').doc(uid);
    const withdrawalRef = db.collection('withdrawals').doc();

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      const currentBalance = snap.data().balance || 0;
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      transaction.update(userRef, {
        balance: currentBalance - amount,
        firstWithdrawalDone: true,
      });

      transaction.set(withdrawalRef, {
        userId: uid,
        amount: amount,
        paypalEmail: paypalEmail,
        status: 'pending',
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.status(200).json({ success: true, withdrawalId: withdrawalRef.id });
  } catch (error) {
    console.error('Withdrawal error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
