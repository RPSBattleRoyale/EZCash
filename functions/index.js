const functions = require('firebase-functions');
const admin = require('firebase-admin');
const paypal = require('@paypal/payouts-sdk');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// ========================
// OFFERWALL WEBHOOK (Updated to handle multiple providers)
// ========================
exports.offerwallWebhook = functions.https.onRequest(async (req, res) => {
  console.log('Webhook received:', {
    method: req.method,
    query: req.query,
    headers: req.headers,
    body: req.body,
  });

  // --- SECURITY CHECKS ---

  // 1. Revtoo secret (sent as x-api-key header)
  const revtooSecret = functions.config().offerwall?.secret;

  // 2. Offermaru S2S secret (sent as query param "secret" or header "X-Secret")
  const offermaruSecret = functions.config().offermaru?.s2s_secret;
  const querySecret = req.query.secret;
  const headerSecret = req.headers['x-secret'];

  const isValidRevtoo = req.headers['x-api-key'] === revtooSecret;
  const isValidOffermaru = (querySecret === offermaruSecret) || (headerSecret === offermaruSecret);

  if (!isValidRevtoo && !isValidOffermaru) {
    console.error('Invalid or missing secret');
    return res.status(403).send('Invalid secret');
  }

  // --- PARSE DATA ---

  let userId, reward, transactionId, offerName;

  // Offermaru sends data as query parameters (GET)
  if (req.method === 'GET' && req.query.user_id) {
    userId = req.query.user_id;
    reward = parseFloat(req.query.user_reward) || 0;
    transactionId = req.query.transaction_id || `offermaru_${Date.now()}`;
    offerName = req.query.offer_name || 'Offermaru offer';
  } 
  // Revtoo sends JSON body (POST)
  else {
    const data = req.body;
    userId = data.user_id || data.userId;
    reward = parseFloat(data.reward) || 0;
    transactionId = data.transaction_id || data.transactionId;
    offerName = data.offer_name || 'Offerwall completion';
  }

  // Validate
  if (!userId || reward <= 0) {
    console.error('Invalid webhook data:', { userId, reward });
    return res.status(400).send('Missing user_id or invalid reward');
  }

  try {
    const userRef = db.collection('users').doc(userId);

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists) {
        throw new Error('User not found');
      }

      const currentBalance = snap.data().balance || 0;
      const newBalance = currentBalance + reward;

      transaction.update(userRef, { balance: newBalance });

      const txRef = db.collection('transactions').doc();
      transaction.set(txRef, {
        userId: userId,
        type: 'earn',
        amount: reward,
        description: offerName || 'Offerwall completion',
        offerwallTxId: transactionId || 'unknown',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log(`✅ Credited ${reward} to user ${userId}`);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal error');
  }
});

// ========================
// 2. WITHDRAWAL REQUEST
// ========================
exports.requestWithdrawal = functions.https.onCall(async (data, context) => {
  // Must be logged in
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in');
  }

  const uid = context.auth.uid;
  const { amount, paypalEmail } = data; // We'll start with PayPal only

  // Validate amount
  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Amount must be greater than 0');
  }

  // Fetch user
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
  const userData = userSnap.data();

  // 🛑 Email verification check
  if (!userData.emailVerified) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Please verify your email before withdrawing.'
    );
  }

  // Minimum withdrawal logic
  const firstWithdrawalDone = userData.firstWithdrawalDone || false;
  const minAmount = firstWithdrawalDone ? 1 : 5;
  if (amount < minAmount) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Minimum withdrawal is $${minAmount}.`
    );
  }

  // Check balance
  if (amount > (userData.balance || 0)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Insufficient balance'
    );
  }

  // PayPal email required
  if (!paypalEmail) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'PayPal email is required'
    );
  }

  // Deduct balance and create withdrawal request
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
      status: 'pending', // 'pending' → 'completed' or 'failed'
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { success: true, withdrawalId: withdrawalRef.id };
});

// ========================
// 3. (OPTIONAL) REFERRAL BONUS
// Call this from your sign-up Cloud Function or client-side after user creation
// ========================
exports.creditReferralBonus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { referralCode } = data;
  if (!referralCode) return { success: false, message: 'No referral code' };

  const newUserId = context.auth.uid;

  // Find the referrer by their referral code
  const referrerQuery = await db.collection('users')
    .where('referralCode', '==', referralCode)
    .limit(1)
    .get();

  if (referrerQuery.empty) {
    return { success: false, message: 'Invalid referral code' };
  }

  const referrerDoc = referrerQuery.docs[0];
  const referrerId = referrerDoc.id;

  // Don't refer yourself
  if (referrerId === newUserId) {
    return { success: false, message: 'Cannot refer yourself' };
  }

  const bonusAmount = 0.50; // $0.50 bonus

  await db.runTransaction(async (transaction) => {
    // Credit referrer
    const refSnap = await transaction.get(referrerDoc.ref);
    const currentBalance = refSnap.data().balance || 0;
    transaction.update(referrerDoc.ref, {
      balance: currentBalance + bonusAmount,
    });

    // Log referral
    const refLog = db.collection('referrals').doc();
    transaction.set(refLog, {
      referrerId: referrerId,
      newUserId: newUserId,
      bonusAmount: bonusAmount,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { success: true };
});
