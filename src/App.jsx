import { useState, useEffect } from 'react';

function App() {
  // Animated counter
  const [count, setCount] = useState(0);
  const targetCount = 100000;

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

  return (
    <>
      {/* ===== STYLES INJECTED HERE ===== */}
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
        }
        .logo {
          font-size: 28px;
          font-weight: 800;
          background: linear-gradient(135deg, #00f5a0, #00d9f5);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .nav-links {
          display: flex;
          gap: 30px;
          font-weight: 500;
          color: #a0aec0;
        }
        .nav-links span { cursor: pointer; transition: color 0.2s; }
        .nav-links span:hover { color: #fff; }
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
          margin-bottom: 20px;
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
          transition: transform 0.15s;
        }
        .btn-primary:hover { transform: scale(1.02); }
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
        .social-buttons { display: flex; flex-direction: column; gap: 12px; }
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

      {/* ===== HTML ===== */}
      <div className="app">
        <nav className="navbar">
          <div className="logo">💰 EZCash</div>
          <div className="nav-links">
            <span>Home</span>
            <span>Cashout</span>
          </div>
        </nav>

        <div className="hero">
          <h1>Get paid for playing games, completing offerwall tasks, and participating in surveys.</h1>
          <p className="subtitle">Earn real cash in your free time. No experience needed.</p>

          <div className="signup-card">
            <div className="input-group">
              <input type="email" placeholder="Email address" />
              <button className="btn-primary">Start earning now →</button>
            </div>
            <div className="divider">OR</div>
            <div className="social-buttons">
              <button className="btn-social google"><span style={{fontSize:'20px'}}>G</span> Sign up with Google</button>
              <button className="btn-social facebook"><span style={{fontSize:'20px'}}>f</span> Sign up with Facebook</button>
            </div>
          </div>

          <div className="social-proof">
            <span className="counter">{count.toLocaleString()}+</span>
            <span>sign ups in the past 24 hours</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
