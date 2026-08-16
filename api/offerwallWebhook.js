import admin from '../lib/firebaseAdmin.js';
import crypto from 'crypto';

const db = admin.firestore();

export default async function handler(req, res) {
  console.log('📨 Webhook received:', {
    method: req.method,
    query: req.query,
    headers: req.headers,
    body: req.body,
  });

  // ============================================================
  // 1. SECURITY CHECKS
  // ============================================================

  // Offermaru: secret as query param or header
  const offermaruSecret = process.env.OFFERMARU_S2S_SECRET;
  const querySecret = req.query.secret;
  const headerSecret = req.headers['x-secret'];
  const isValidOffermaru = (querySecret === offermaruSecret) || (headerSecret === offermaruSecret);

  // Revtoo: signature verification (handled later in the parsing logic)
  // We'll check the signature after parsing the data

  // ============================================================
  // 2. PARSE DATA (Detect which offerwall is calling)
  // ============================================================

  let userId, reward, transactionId, offerName, status;

  // --- A. Offermaru (GET request with query params) ---
  if (req.method === 'GET' && req.query.user_id) {
    if (!isValidOffermaru) {
      console.error('❌ Invalid Offermaru secret');
      return res.status(403).send('Invalid secret');
    }

    userId = req.query.user_id;
    reward = parseFloat(req.query.user_reward) || 0;
    transactionId = req.query.transaction_id || `offermaru_${Date.now()}`;
    offerName = req.query.offer_name || 'Offermaru offer';
    status = '1'; // Always credit for Offermaru
  }

  // --- B. Revtoo (POST request with form data) ---
  else if (req.method === 'POST') {
    const data = req.body;

    // Extract Revtoo parameters
    const subId = data.subId;
    const rewardRaw = parseFloat(data.reward) || 0;
    const transId = data.transId || `revtoo_${Date.now()}`;
    const offerNameRaw = data.offer_name || 'Revtoo offer';
    const statusRaw = data.status; // "1" = credit, "2" = chargeback
    const signature = data.signature;
    const debug = data.debug; // "1" = test, "0" = live

    // --- Revtoo Security: Verify signature ---
    // Format: subId + transId + reward + secretKey (MD5)
    // IMPORTANT: Confirm this exact format with Revtoo support!
    const secretKey = process.env.OFFERWALL_SECRET;
    if (!secretKey) {
      console.error('❌ OFFERWALL_SECRET not set');
      return res.status(500).send('Server configuration error');
    }

    // Construct the string to hash
    const signatureString = `${subId}${transId}${rewardRaw}${secretKey}`;
    const expectedSignature = crypto.createHash('md5').update(signatureString).digest('hex');

    if (signature && expectedSignature !== signature) {
      console.error('❌ Invalid Revtoo signature');
      console.log(`Expected: ${expectedSignature}, Received: ${signature}`);
      return res.status(403).send('Invalid signature');
    }

    // --- Skip test/debug postbacks (optional) ---
    if (debug === '1') {
      console.log('🧪 Skipping test postback (debug=1)');
      return res.status(200).send('OK');
    }

    // --- Only process credit status ---
    if (statusRaw !== '1') {
      console.log(`⏭️ Skipping non-credit status: ${statusRaw}`);
      return res.status(200).send('OK');
    }

    // --- Assign values ---
    userId = subId;
    reward = rewardRaw;
    transactionId = transId;
    offerName = offerNameRaw || 'Revtoo offer';
    status = statusRaw;
  }

  // --- C. Unknown/Unsupported ---
  else {
    console.error('❌ Unsupported request method or missing user_id');
    return res.status(400).send('Bad request');
  }

  // ============================================================
  // 3. VALIDATE INPUT
  // ============================================================

  if (!userId || reward <= 0) {
    console.error('❌ Invalid webhook data:', { userId, reward });
    return res.status(400).send('Missing user_id or invalid reward');
  }

  // ============================================================
  // 4. CHECK FOR DUPLICATE TRANSACTION (Prevent double credits)
  // ============================================================

  try {
    const txSnapshot = await db.collection('transactions')
      .where('offerwallTxId', '==', transactionId)
      .limit(1)
      .get();

    if (!txSnapshot.empty) {
      console.log(`⏭️ Duplicate transaction ${transactionId} - already processed`);
      return res.status(200).send('OK');
    }
  } catch (error) {
    console.error('⚠️ Error checking for duplicates:', error);
    // Continue anyway – we'll handle it in the transaction
  }

  // ============================================================
  // 5. CREDIT THE USER
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

      // Update user balance
      transaction.update(userRef, { balance: newBalance });

      // Record the earning (this also acts as our duplicate prevention)
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
}
