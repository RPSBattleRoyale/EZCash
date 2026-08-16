import admin from '../lib/firebaseAdmin.js';

const db = admin.firestore();

export default async function handler(req, res) {
  console.log('Webhook received:', {
    method: req.method,
    query: req.query,
    headers: req.headers,
    body: req.body,
  });

  // --- SECURITY CHECKS ---
  const revtooSecret = process.env.OFFERWALL_SECRET;
  const offermaruSecret = process.env.OFFERMARU_S2S_SECRET;
  
  const querySecret = req.query.secret;
  const headerSecret = req.headers['x-secret'];
  const apiKeyHeader = req.headers['x-api-key'];

  const isValidRevtoo = apiKeyHeader === revtooSecret;
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
}
