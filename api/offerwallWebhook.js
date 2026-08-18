const crypto = require('crypto');
const Busboy = require('busboy');
const { supabase } = require('../lib/supabaseClient.js');

// Helper to parse multipart form data
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const fields = {};
    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });
    busboy.on('file', (fieldname, file, info) => {
      file.resume(); // skip files
    });
    busboy.on('finish', () => resolve(fields));
    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

module.exports = async function handler(req, res) {
  console.log('📨 Webhook received:', {
    method: req.method,
    query: req.query,
    headers: req.headers,
    body: req.body,
  });

  // ============================================================
  // 1. SECURITY
  // ============================================================
  const offermaruSecret = process.env.OFFERMARU_S2S_SECRET;
  const revtooSecret = process.env.OFFERWALL_SECRET;

  const querySecret = req.query.secret;
  const headerSecret = req.headers['x-secret'];
  const apiKeyHeader = req.headers['x-api-key'];

  const isValidOffermaru = (querySecret === offermaruSecret) || (headerSecret === offermaruSecret);
  const isValidRevtoo = (apiKeyHeader === revtooSecret) || (querySecret === revtooSecret);

  // ============================================================
  // 2. PARSE
  // ============================================================
  let userId, reward, transactionId, offerName;

  // --- Offermaru (GET) ---
  if (req.method === 'GET' && req.query.user_id) {
    if (!isValidOffermaru) {
      console.error('❌ Invalid Offermaru secret');
      return res.status(403).send('Invalid secret');
    }
    userId = req.query.user_id;
    reward = parseFloat(req.query.user_reward) || 0;
    transactionId = req.query.transaction_id || `offermaru_${Date.now()}`;
    offerName = req.query.offer_name || 'Offermaru offer';
  }

  // --- Revtoo (POST) ---
  else if (req.method === 'POST') {
    if (!isValidRevtoo) {
      console.error('❌ Invalid Revtoo secret');
      return res.status(403).send('Invalid secret');
    }

    // Parse multipart form data if needed
    let data = req.body;
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      try {
        data = await parseMultipart(req);
        console.log('✅ Parsed multipart fields:', data);  // <-- ADD THIS
      } catch (err) {
        console.error('❌ Failed to parse multipart:', err);
        return res.status(400).send('Bad request');
      }
    } else {
      console.log('📦 Body (JSON):', data);
    }
  
    // Now extract fields
    const subId = data.subId;
    const rewardRaw = parseFloat(data.reward) || 0;
    const transId = data.transId || `revtoo_${Date.now()}`;
    const statusRaw = data.status;
    const signature = data.signature;
    const debug = data.debug;

    // --- Signature verification ---
    const secretKey = process.env.OFFERWALL_SECRET; // 41d8c054a3b1a91a4e28c81cc6f0e5b0
    
    // CORRECT ORDER: subId + transId + reward + secret
    const stringToHash = subId + transId + rewardRaw + secretKey;
    const expectedSignature = crypto.createHash('md5').update(stringToHash).digest('hex');
    
    console.log('🔑 Signature check:', {
      received: signature,
      expected: expectedSignature,
      stringUsed: stringToHash,
    });
    
    if (signature && expectedSignature !== signature) {
      console.error('❌ Invalid Revtoo signature');
      return res.status(403).send('Invalid signature');
    }

    if (debug === '1') {
      console.log('🧪 Skipping test postback');
      return res.status(200).send('OK');
    }

    if (statusRaw !== '1') {
      console.log(`⏭️ Skipping non-credit status: ${statusRaw}`);
      return res.status(200).send('OK');
    }

    userId = subId;
    reward = rewardRaw;
    transactionId = transId;
    offerName = offerNameRaw || 'Revtoo offer';
  }

  // --- Unknown ---
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
  // 4. CREDIT via Supabase RPC
  // ============================================================
  try {
    const { data, error } = await supabase.rpc('credit_offerwall', {
      p_user_id: userId,
      p_amount: reward,
      p_tx_id: transactionId,
      p_source: offerName?.includes('Revtoo') ? 'revtoo' : 'offermaru',
    });

    if (error) {
      console.error('❌ Supabase error:', error);
      if (error.message.includes('Duplicate transaction')) {
        console.log('⏭️ Duplicate transaction, ignoring');
        return res.status(200).send('OK');
      }
      return res.status(500).send('Internal error');
    }

    if (data && !data.success) {
      console.error('❌ RPC returned error:', data.error);
      return res.status(500).send('Internal error');
    }

    console.log(`✅ Credited ${reward} to user ${userId} (${offerName})`);
    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).send('Internal error');
  }
};
