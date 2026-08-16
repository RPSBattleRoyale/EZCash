const admin = require('../lib/firebaseAdmin.cjs');
const crypto = require('crypto');

const db = admin.firestore();

module.exports = async function handler(req, res) {
  console.log('📨 Webhook received:', {
    method: req.method,
    query: req.query,
    headers: req.headers,
    body: req.body,
  });

  // ============================================================
  // 1. SECURITY CHECKS
  // ============================================================

  const offermaruSecret = process.env.OFFERMARU_S2S_SECRET;
  const querySecret = req.query.secret;
  const headerSecret = req.headers['x-secret'];
  const isValidOffermaru = (querySecret === offermaruSecret) || (headerSecret === offermaruSecret);

  // ============================================================
  // 2. PARSE DATA
  // ============================================================

  let userId, reward, transactionId, offerName, status;

  // --- A. Offermaru (GET) ---
  if (req.method === 'GET' && req.query.user_id) {
    if (!isValidOffermaru) {
      console.error('❌ Invalid Offermaru secret');
      return res.status(403).send('Invalid secret');
    }

    userId = req.query.user_id;
    reward = parseFloat(req.query.user_reward) || 0;
    transactionId = req.query.transaction_id || `offermaru_${Date.now()}`;
    offerName = req.query.offer_name || 'Offermaru offer';
    status = '1';
  }

  // --- B. Revtoo (POST) ---
  else if (req.method === 'POST') {
    const data = req.body;

    const subId = data.subId;
    const rewardRaw = parseFloat(data.reward) || 0;
    const transId = data.transId || `revtoo_${Date.now()}`;
    const offerNameRaw = data.offer_name || 'Revtoo offer';
    const statusRaw = data.status;
    const signature = data.signature;
    const debug = data.debug;

    // Verify Revtoo signature
    const secretKey = process.env.OFFERWALL_SECRET;
    if (!secretKey) {
      console.error('❌ OFFERWALL_SECRET not set');
      return res.status(500).send('Server configuration error');
    }

    const signatureString = `${subId}${transId}${rewardRaw}${secretKey}`;
    const expectedSignature = crypto.createHash('md5').update(signatureString).digest('hex');

    if (signature && expectedSignature !== signature) {
      console.error('❌ Invalid Revtoo signature');
      return res.status(403).send('Invalid signature');
    }

    // Skip test postbacks
    if (debug === '1') {
      console.log('🧪 Skipping test postback');
      return res.status(200).send('OK');
    }

    // Only process credit status
    if (statusRaw !== '1') {
      console.log(`⏭️ Skipping non-credit status: ${statusRaw}`);
      return res.status(200).send('OK');
    }

    userId = subId;
    reward = rewardRaw;
    transactionId = transId;
    offerName = offerNameRaw || 'Revtoo offer';
    status = statusRaw;
  }

  // --- C. Unknown ---
  else {
    console.error('❌ Unsupported request');
    return res.status(400).send('Bad request');
  }

  // ============================================================
  // 3. VALIDATE
  // ============================================================

  if (!userId || reward <= 0) {
    console.error('❌ Invalid data:', { userId, reward });
    return res.status(400).send('Missing user_id or invalid reward');
  }

  // ============================================================
  // 4. DUPLICATE CHECK
  // ============================================================

  try {
    const txSnapshot = await db.collection('transactions')
      .where('offerwallTxId', '==', transactionId)
      .limit(1)
      .get();

    if (!txSnapshot.empty) {
      console.log(`⏭️ Duplicate transaction ${transactionId}`);
      return res.status(200).send('OK');
    }
  } catch (error) {
    console.error('⚠️ Duplicate check error:', error);
  }

  // ============================================================
  // 5. CREDIT USER
  // ============================================================

  try {
    const userRef = db.collection('users').doc(userId);

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists) {
        throw new Error(`User ${userId} not found`);
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
        source: offerName?.includes('Revtoo') ? 'revtoo' : 'offermaru',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log(`✅ Credited ${reward} to user ${userId} (${offerName})`);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).send('Internal error');
  }
};
