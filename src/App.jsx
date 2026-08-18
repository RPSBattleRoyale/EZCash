import { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from './firebase';
import { supabase } from './supabase';

function App() {
  // ===== STATE =====
  const [currentPage, setCurrentPage] = useState('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Auth
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // User data from Supabase
  const [userData, setUserData] = useState({ balance: 0, firstWithdrawalDone: false });

  // Admin data
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);

  // Daily signup count (via Supabase)
  const [dailySignups, setDailySignups] = useState(0);
  const [loadingDailyCount, setLoadingDailyCount] = useState(true);

  // Offerwall dropdown
  const [selectedOfferwall, setSelectedOfferwall] = useState('revtoo');

  // Withdrawal form
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [withdrawMessage, setWithdrawMessage] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  // ===== EFFECTS =====

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const adminEmail = 'flynzb9957@zohomail.com';
        setIsAdmin(currentUser.email === adminEmail);

        // Set up real-time subscription for user data
        const subscription = supabase
          .channel(`user-${currentUser.uid}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'users',
              filter: `id=eq.${currentUser.uid}`,
            },
            (payload) => {
              setUserData({
                balance: payload.new.balance || 0,
                firstWithdrawalDone: payload.new.first_withdrawal_done || false,
              });
            }
          )
          .subscribe();

        // Fetch initial user data
        const { data, error } = await supabase
          .from('users')
          .select('balance, first_withdrawal_done')
          .eq('id', currentUser.uid)
          .single();

        if (data) {
          setUserData({
            balance: data.balance || 0,
            firstWithdrawalDone: data.first_withdrawal_done || false,
          });
        }

        if (currentPage === 'home' || currentPage === 'login') {
          setCurrentPage('dashboard');
        }

        return () => {
          subscription.unsubscribe();
        };
      } else {
        setIsAdmin(false);
        setUserData({ balance: 0, firstWithdrawalDone: false });
        if (currentPage !== 'home' && currentPage !== 'login') {
          setCurrentPage('home');
        }
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch daily signups from Supabase
  const fetchDailySignups = async () => {
    setLoadingDailyCount(true);
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString());

      if (error) throw error;
      setDailySignups(count || 0);
    } catch (error) {
      console.error('Error fetching daily signups:', error);
      setDailySignups(0);
    } finally {
      setLoadingDailyCount(false);
    }
  };

  useEffect(() => {
    fetchDailySignups();
  }, []);

  // Admin fetch pending withdrawals
  const fetchPendingWithdrawals = async () => {
    setLoadingWithdrawals(true);
    try {
      const { data, error } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setPendingWithdrawals(data || []);
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
    } finally {
      setLoadingWithdrawals(false);
    }
  };

  useEffect(() => {
    if (isAdmin && currentPage === 'admin') {
      fetchPendingWithdrawals();
    }
  }, [isAdmin, currentPage]);

  // ===== HANDLERS =====

  // Sign Up
  const handleSignUp = async () => {
    setMessage('');
    if (!email) { setMessage('⚠️ Please enter your email address.'); return; }
    if (!email.includes('@')) { setMessage('⚠️ Please enter a valid email address.'); return; }
    if (!password) { setMessage('⚠️ Please enter a password.'); return; }
    if (password.length < 6) { setMessage('⚠️ Password must be at least 6 characters.'); return; }

    setIsLoading(true);
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);

      // Insert into Supabase
      const { error: supabaseError } = await supabase
        .from('users')
        .insert({
          id: userCred.user.uid,
          email: userCred.user.email,
          email_verified: false,
        });

      if (supabaseError) {
        console.error('Supabase insert error:', supabaseError);
        setMessage('❌ Failed to create user in database.');
        await signOut(auth);
        return;
      }

      await sendEmailVerification(userCred.user);
      await signOut(auth);
      setMessage('✅ Verification email sent! Check your inbox.');
      setEmail('');
      setPassword('');
      fetchDailySignups();
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        setMessage('❌ Email already registered. Please log in.');
      } else {
        setMessage(`❌ ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Login
  const handleLogin = async () => {
    setMessage('');
    if (!loginEmail || !loginPassword) {
      setMessage('⚠️ Please enter both email and password.');
      return;
    }
    setIsLoading(true);
    try {
      const userCred = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      if (!userCred.user.emailVerified) {
        setMessage('❌ Please verify your email before logging in.');
        await signOut(auth);
        return;
      }
      setMessage('✅ Login successful!');
      setLoginEmail('');
      setLoginPassword('');
    } catch (error) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setMessage('❌ Invalid email or password.');
      } else {
        setMessage(`❌ ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setCurrentPage('home');
    setMessage('');
  };

  // Withdrawal
  const handleWithdraw = async () => {
    setWithdrawMessage('');
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      setWithdrawMessage('⚠️ Please enter a valid amount.');
      return;
    }

    const minAmount = userData.firstWithdrawalDone ? 1 : 5;
    if (amount < minAmount) {
      setWithdrawMessage(`⚠️ Minimum withdrawal is $${minAmount}.`);
      return;
    }

    if (amount > userData.balance) {
      setWithdrawMessage(`⚠️ Insufficient balance. You have $${userData.balance.toFixed(2)}.`);
      return;
    }

    if (!paypalEmail || !paypalEmail.includes('@')) {
      setWithdrawMessage('⚠️ Please enter a valid PayPal email.');
      return;
    }

    setWithdrawLoading(true);
    try {
      const { data, error } = await supabase.rpc('request_withdrawal', {
        p_user_id: auth.currentUser.uid,
        p_amount: amount,
        p_paypal_email: paypalEmail,
      });

      if (error) {
        console.error('RPC error:', error);
        setWithdrawMessage(`❌ ${error.message}`);
      } else if (!data.success) {
        setWithdrawMessage(`❌ ${data.error}`);
      } else {
        setWithdrawMessage('✅ Withdrawal request submitted!');
        setWithdrawAmount('');
        setPaypalEmail('');
      }
    } catch (err) {
      console.error('Withdrawal error:', err);
      setWithdrawMessage('❌ Network error. Please try again.');
    } finally {
      setWithdrawLoading(false);
    }
  };

  // ===== SOCIAL PLACEHOLDERS =====
  const handleGoogleSignUp = () => setMessage('🔐 Google sign-up coming soon!');
  const handleFacebookSignUp = () => setMessage('🔐 Facebook sign-up coming soon!');

  // ===== OFFERWALL URL =====
  const getOfferwallUrl = () => {
    const userEmail = user?.email || '';
    switch (selectedOfferwall) {
      case 'revtoo':
        return `https://revtoo.com/offerwall/5ligfp5sxw86qi5mb3175nx48l09dd/${encodeURIComponent(userEmail)}`;
      case 'offermaru':
        return `https://wall.offermaru.com/20415?user_id=${encodeURIComponent(userEmail)}`;
      default:
        return 'https://www.offerwalls.com/placeholder';
    }
  };

  // ===== PAGE COMPONENTS =====

  const renderHome = () => (
    <div className="hero">
      <h1>Get paid for testing apps, games & surveys</h1>
      <p className="subtitle">Earn real cash in your free time. No experience needed.</p>
      <div className="signup-card">
        <div className="input-group">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
          <input
            type="password"
            placeholder="Create a password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
          />
          <button className="btn-primary" onClick={handleSignUp} disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Start earning now →'}
          </button>
        </div>
        {message && (
          <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: '#1a1f3a', color: '#a0aec0', fontSize: '14px', textAlign: 'center' }}>
            {message}
          </div>
        )}
        <div className="divider">OR</div>
        <div className="social-buttons">
          <button className="btn-social google" onClick={handleGoogleSignUp}>
            <span style={{ fontSize: '20px' }}>G</span> Sign up with Google
          </button>
          <button className="btn-social facebook" onClick={handleFacebookSignUp}>
            <span style={{ fontSize: '20px' }}>f</span> Sign up with Facebook
          </button>
        </div>
      </div>
      <div className="social-proof">
        <span className="counter">
          {loadingDailyCount ? '...' : dailySignups.toLocaleString()}+
        </span>
        <span>sign ups in the past 24 hours</span>
      </div>
    </div>
  );

  const renderLogin = () => (
    <div className="hero">
      <h1 style={{ fontSize: '42px' }}>Welcome Back</h1>
      <p className="subtitle">Log in to your EZCash account</p>
      <div className="signup-card">
        <div className="input-group">
          <input
            type="email"
            placeholder="Email address"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            disabled={isLoading}
          />
          <input
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            disabled={isLoading}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button className="btn-primary" onClick={handleLogin} disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Log In →'}
          </button>
        </div>
        {message && (
          <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: '#1a1f3a', color: '#a0aec0', fontSize: '14px', textAlign: 'center' }}>
            {message}
          </div>
        )}
        <div style={{ marginTop: '15px', color: '#4a4f6f', fontSize: '14px' }}>
          Don't have an account? <span style={{ color: '#00f5a0', cursor: 'pointer' }} onClick={() => setCurrentPage('home')}>Sign up here</span>
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="hero">
      <h1 style={{ fontSize: '38px' }}>👋 Welcome, {user?.email}</h1>
      <p className="subtitle">Complete offers below to earn cash!</p>
      <div className="dashboard-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '15px 20px', background: '#0d0f23', borderRadius: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ color: '#4a4f6f', fontSize: '14px' }}>Your Balance</div>
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#00f5a0' }}>
              ${userData.balance.toFixed(2)}
            </div>
          </div>
          <div style={{ fontSize: '13px', color: '#4a4f6f' }}>
            {user?.emailVerified ? '✅ Verified' : '⚠️ Verify your email to withdraw'}
          </div>
        </div>
        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ color: '#a0aec0', fontWeight: '600' }}>📱 Offerwall</div>
            <select
              value={selectedOfferwall}
              onChange={(e) => setSelectedOfferwall(e.target.value)}
              style={{
                padding: '8px 15px',
                borderRadius: '8px',
                background: '#0d0f23',
                color: '#fff',
                border: '1px solid #2a2f4f',
                fontSize: '14px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="revtoo">Revtoo</option>
              <option value="offermaru">Offermaru</option>
            </select>
          </div>
          <div style={{ background: '#0d0f23', borderRadius: '12px', overflow: 'hidden', height: '500px', border: '1px solid #2a2f4f' }}>
            <iframe
              src={getOfferwallUrl()}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Offerwall"
            />
          </div>
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#4a4f6f', textAlign: 'center' }}>
            💡 Complete offers, surveys, and app downloads to earn real cash. Your balance updates automatically.
          </div>
        </div>
      </div>
    </div>
  );

  const renderCashout = () => {
    const minAmount = userData.firstWithdrawalDone ? 1 : 5;
    return (
      <div className="hero">
        <h1 style={{ fontSize: '38px' }}>💰 Cash Out Your Earnings</h1>
        <p className="subtitle">
          Minimum withdrawal: ${minAmount} for {userData.firstWithdrawalDone ? 'subsequent' : 'first'} withdrawal.
        </p>
        <div className="signup-card" style={{ maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '40px', fontWeight: '700', color: '#00f5a0' }}>
              ${userData.balance.toFixed(2)}
            </div>
            <div style={{ color: '#4a4f6f', fontSize: '14px' }}>Your current balance</div>
          </div>
          <div className="input-group">
            <input
              type="number"
              placeholder={`Amount (min $${minAmount})`}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={withdrawLoading}
            />
            <input
              type="email"
              placeholder="PayPal email address"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              disabled={withdrawLoading}
            />
            <button
              className="btn-primary"
              onClick={handleWithdraw}
              disabled={withdrawLoading || !user?.emailVerified}
            >
              {withdrawLoading ? 'Processing...' : 'Request Withdrawal'}
            </button>
          </div>
          {!user?.emailVerified && (
            <div style={{ marginTop: '10px', color: '#ff6b6b', fontSize: '14px' }}>
              ⚠️ Please verify your email before withdrawing.
            </div>
          )}
          {withdrawMessage && (
            <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: '#1a1f3a', color: '#a0aec0', fontSize: '14px', textAlign: 'center' }}>
              {withdrawMessage}
            </div>
          )}
          <div style={{ marginTop: '15px', fontSize: '13px', color: '#4a4f6f', textAlign: 'center' }}>
            ⚡ Withdrawals are sent to your PayPal account within 24-48 hours.
          </div>
        </div>
      </div>
    );
  };

  const renderAdminPanel = () => (
    <div className="hero">
      <h1 style={{ fontSize: '38px' }}>🛡️ Admin Panel</h1>
      <p className="subtitle">Manage pending withdrawal requests</p>
      <div className="admin-card">
        {loadingWithdrawals ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#4a4f6f' }}>Loading withdrawals...</div>
        ) : pendingWithdrawals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#4a4f6f' }}>✅ No pending withdrawals.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '500px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #2a2f4f', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>User ID</th>
                  <th style={{ padding: '10px' }}>Amount</th>
                  <th style={{ padding: '10px' }}>PayPal Email</th>
                  <th style={{ padding: '10px' }}>Requested At</th>
                  <th style={{ padding: '10px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingWithdrawals.map((w) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid #1a1f3a' }}>
                    <td style={{ padding: '10px', color: '#a0aec0', wordBreak: 'break-all' }}>{w.user_id}</td>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#00f5a0' }}>${w.amount}</td>
                    <td style={{ padding: '10px' }}>{w.paypal_email}</td>
                    <td style={{ padding: '10px', color: '#4a4f6f' }}>
                      {new Date(w.requested_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <button
                        onClick={() => alert(`TODO: Mark ${w.id} as paid.`)}
                        style={{
                          background: '#00f5a0',
                          color: '#0a0b1e',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        Mark Paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: '15px', fontSize: '13px', color: '#4a4f6f', textAlign: 'center' }}>
          Total pending: <strong style={{ color: '#fff' }}>{pendingWithdrawals.length}</strong>
        </div>
      </div>
    </div>
  );

  // ===== MAIN RENDER =====
  if (loadingAuth) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0b1e', color: '#fff' }}>
        Loading...
      </div>
    );
  }

  // CSS is the same as before – keep it or import from a file.
  // For brevity, I'm including inline styles; you can move them to App.css.
  const styles = { /* ... your existing CSS ... */ };

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, sans-serif;
          background: #0a0b1e;
          color: #fff;
          min-height: 100vh;
          display: block;
        }
        .app { width: 100%; max-width: 1200px; padding: 20px 30px; margin: 0 auto; min-height: 100vh; }
        .navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0 30px 0;
          border-bottom: 1px solid #1a1f3a;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 10px;
        }
        .navbar-left { display: flex; align-items: center; gap: 30px; flex-wrap: wrap; }
        .logo {
          font-size: 28px;
          font-weight: 800;
          background: linear-gradient(135deg, #00f5a0, #00d9f5);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          cursor: pointer;
        }
        .nav-links {
          display: flex;
          gap: 20px;
          font-weight: 500;
          color: #a0aec0;
          flex-wrap: wrap;
        }
        .nav-links span {
          cursor: pointer;
          transition: color 0.2s;
          padding: 5px 10px;
          border-radius: 8px;
        }
        .nav-links span:hover { color: #fff; background: #1a1f3a; }
        .nav-links .active { color: #00f5a0; background: #1a2a2a; }
        .navbar-right { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
        .btn-logout {
          padding: 8px 16px;
          border: 1px solid #2a2f4f;
          background: transparent;
          color: #a0aec0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-logout:hover { background: #1a1f3a; color: #fff; border-color: #ff6b6b; }
        .user-email { font-size: 14px; color: #4a4f6f; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 20px 0;
        }
        .hero h1 {
          font-size: 52px;
          font-weight: 800;
          line-height: 1.15;
          max-width: 700px;
          margin-bottom: 10px;
          background: linear-gradient(to right, #ffffff, #94a3b8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero .subtitle {
          font-size: 18px;
          color: #94a3b8;
          margin-bottom: 40px;
        }
        .signup-card, .dashboard-card, .admin-card {
          background: #13162e;
          border: 1px solid #2a2f4f;
          border-radius: 20px;
          padding: 40px 50px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        }
        .dashboard-card, .admin-card { max-width: 900px; }
        .signup-card .input-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .signup-card input {
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid #2a2f4f;
          background: #0d0f23;
          color: #fff;
          font-size: 16px;
          outline: none;
        }
        .signup-card input::placeholder { color: #4a4f6f; }
        .signup-card input:focus { border-color: #00f5a0; }
        .btn-primary {
          padding: 16px 20px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #00f5a0, #00d9f5);
          color: #0a0b1e;
          font-weight: 700;
          font-size: 18px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.2s;
        }
        .btn-primary:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 8px 25px rgba(0, 245, 160, 0.2); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .divider {
          display: flex;
          align-items: center;
          gap: 15px;
          margin: 25px 0;
          color: #4a4f6f;
          font-size: 14px;
        }
        .divider::before, .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #2a2f4f;
        }
        .social-buttons { display: flex; flex-direction: column; gap: 12px; margin-top: 5px; }
        .btn-social {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid #2a2f4f;
          background: transparent;
          color: #fff;
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-social.google:hover { background: rgba(234, 67, 53, 0.15); border-color: #ea4335; }
        .btn-social.facebook:hover { background: rgba(24, 119, 242, 0.15); border-color: #1877f2; }
        .social-proof {
          margin-top: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 15px;
          color: #a0aec0;
          flex-wrap: wrap;
        }
        .social-proof .counter { font-weight: 700; font-size: 18px; color: #00f5a0; }
        @media (max-width: 640px) {
          .hero h1 { font-size: 32px; }
          .signup-card, .dashboard-card, .admin-card { padding: 20px; max-width: 100%; }
          .navbar { flex-direction: column; align-items: stretch; }
          .navbar-left { flex-direction: column; align-items: stretch; gap: 10px; }
          .nav-links { justify-content: center; }
          .navbar-right { justify-content: center; }
        }
        table { font-size: 12px; }
        th { color: #a0aec0; font-weight: 600; }
        td { word-break: break-all; }
      `}</style>

      <div className="app">
        <nav className="navbar">
          <div className="navbar-left">
            <div className="logo" onClick={() => setCurrentPage('home')}>💰 EZCash</div>
            <div className="nav-links">
              {!user ? (
                <>
                  <span className={currentPage === 'home' ? 'active' : ''} onClick={() => setCurrentPage('home')}>Sign Up</span>
                  <span className={currentPage === 'login' ? 'active' : ''} onClick={() => setCurrentPage('login')}>Login</span>
                </>
              ) : (
                <>
                  <span className={currentPage === 'dashboard' ? 'active' : ''} onClick={() => setCurrentPage('dashboard')}>Dashboard</span>
                  <span className={currentPage === 'cashout' ? 'active' : ''} onClick={() => setCurrentPage('cashout')}>Cashout</span>
                  {isAdmin && (
                    <span className={currentPage === 'admin' ? 'active' : ''} onClick={() => setCurrentPage('admin')}>Admin</span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="navbar-right">
            {user && <span className="user-email">{user.email}</span>}
            {user && (
              <button className="btn-logout" onClick={handleLogout}>
                Logout
              </button>
            )}
          </div>
        </nav>

        {!user && currentPage === 'login' && renderLogin()}
        {!user && currentPage === 'home' && renderHome()}
        {user && currentPage === 'dashboard' && renderDashboard()}
        {user && currentPage === 'cashout' && renderCashout()}
        {user && isAdmin && currentPage === 'admin' && renderAdminPanel()}
      </div>
    </>
  );
}

export default App;
