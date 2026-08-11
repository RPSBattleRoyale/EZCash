import { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from './firebase';

function App() {
  // ===== STATE =====
  const [currentPage, setCurrentPage] = useState('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Animated counter
  const [count, setCount] = useState(0);
  const targetCount = 0;

  useEffect(() => {
    let start = 0;
    const duration = 2000;
    const increment = targetCount / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= targetCount) {
        setCount(targetCount);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, []);

  // ===== FIREBASE SIGN-UP =====
  const handleSignUp = async () => {
    // Reset message
    setMessage('');

    // Validate email
    if (!email) {
      setMessage('⚠️ Please enter your email address.');
      return;
    }
    if (!email.includes('@')) {
      setMessage('⚠️ Please enter a valid email address.');
      return;
    }

    // Validate password
    if (!password) {
      setMessage('⚠️ Please enter a password.');
      return;
    }
    if (password.length < 6) {
      setMessage('⚠️ Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Create the user
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      
      // 2. Send verification email
      await sendEmailVerification(userCred.user);
      
      // 3. Sign them out (so they must verify before logging in again)
      await signOut(auth);

      setMessage('✅ Verification email sent! Please check your inbox and click the link to verify your email. You can withdraw only after verifying.');
      setEmail('');
      setPassword('');
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        setMessage('❌ This email is already registered. Please log in instead.');
      } else {
        setMessage(`❌ ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    setMessage('🔐 Google sign-up coming soon!');
  };

  const handleFacebookSignUp = () => {
    setMessage('🔐 Facebook sign-up coming soon!');
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
        <span className="counter">{count.toLocaleString()}+</span>
        <span>sign ups in the past 24 hours</span>
      </div>
    </div>
  );

  const renderCashout = () => (
    <div className="hero" style={{ paddingTop: '20px' }}>
      <h1 style={{ fontSize: '38px' }}>💰 Cash Out Your Earnings</h1>
      <p className="subtitle">Minimum withdrawal: $5 for first time, $1 afterwards.</p>

      <div className="signup-card" style={{ maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '40px', fontWeight: '700', color: '#00f5a0' }}>$0.00</div>
          <div style={{ color: '#4a4f6f', fontSize: '14px' }}>Your current balance</div>
        </div>

        <div className="input-group">
          <input type="number" placeholder="Amount to withdraw (min $5)" />
          <input type="email" placeholder="PayPal email address" />
          <button className="btn-primary" onClick={() => alert('🚀 Withdrawal request sent! (This will be processed in 24-48 hours)')}>
            Request Withdrawal
          </button>
        </div>

        <div style={{ marginTop: '15px', fontSize: '13px', color: '#4a4f6f', textAlign: 'center' }}>
          ⚡ Withdrawals are sent to your PayPal account within 24-48 hours.
        </div>
      </div>
    </div>
  );

  // ===== NAVBAR + RENDER =====
  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, sans-serif;
          background: #0a0b1e;
          color: #fff;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .app {
          width: 100%;
          max-width: 1200px;
          padding: 20px 30px;
          margin: 0 auto;
        }
        .navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0 30px 0;
          border-bottom: 1px solid #1a1f3a;
          margin-bottom: 20px;
        }
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
          gap: 30px;
          font-weight: 500;
          color: #a0aec0;
        }
        .nav-links span {
          cursor: pointer;
          transition: color 0.2s;
          padding: 5px 10px;
          border-radius: 8px;
        }
        .nav-links span:hover { color: #fff; background: #1a1f3a; }
        .nav-links .active {
          color: #00f5a0;
          background: #1a2a2a;
        }
        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 40px 0 20px 0;
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
        .signup-card {
          background: #13162e;
          border: 1px solid #2a2f4f;
          border-radius: 20px;
          padding: 40px 50px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        }
        .signup-card .input-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 0px;
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
        }
        .social-proof .counter {
          font-weight: 700;
          font-size: 18px;
          color: #00f5a0;
        }
        @media (max-width: 640px) {
          .hero h1 { font-size: 32px; }
          .signup-card { padding: 30px 20px; }
          .navbar { flex-direction: column; gap: 10px; }
          .nav-links { gap: 20px; font-size: 14px; }
        }
      `}</style>

      <div className="app">
        {/* ===== NAVBAR ===== */}
        <nav className="navbar">
          <div className="logo" onClick={() => setCurrentPage('home')}>💰 EZCash</div>
          <div className="nav-links">
            <span
              className={currentPage === 'home' ? 'active' : ''}
              onClick={() => setCurrentPage('home')}
            >
              Home
            </span>
            <span
              className={currentPage === 'cashout' ? 'active' : ''}
              onClick={() => setCurrentPage('cashout')}
            >
              Cashout
            </span>
          </div>
        </nav>

        {/* ===== PAGE RENDERER ===== */}
        {currentPage === 'home' ? renderHome() : renderCashout()}
      </div>
    </>
  );
}

export default App;
