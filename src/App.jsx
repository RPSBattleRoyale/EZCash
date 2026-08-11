import { useState, useEffect } from 'react';

function App() {
  // Animated counter state
  const [count, setCount] = useState(0);
  const targetCount = 100000;

  useEffect(() => {
    let start = 0;
    const duration = 10000; // 2 seconds
    const increment = targetCount / (duration / 16); // ~60fps

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
    <div className="app">
      {/* ===== NAVBAR ===== */}
      <nav className="navbar">
        <div className="logo">💰 EZCash</div>
        <div className="nav-links">
          <span>Home</span>
          <span>Cashout</span>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <div className="hero">
        <h1>Get paid for playing games & doing surveys.</h1>
        <p className="subtitle">Earn real cash in your free time. No experience needed.</p>

        {/* ===== SIGNUP CARD ===== */}
        <div className="signup-card">
          <div className="input-group">
            <input type="email" placeholder="Email address" />
            <button className="btn-primary">Start earning now →</button>
          </div>

          <div className="divider">OR</div>

          <div className="social-buttons">
            <button className="btn-social google">
              <span style={{ fontSize: '20px' }}>G</span> Sign up with Google
            </button>
            <button className="btn-social facebook">
              <span style={{ fontSize: '20px' }}>f</span> Sign up with Facebook
            </button>
          </div>
        </div>

        {/* ===== SOCIAL PROOF ===== */}
        <div className="social-proof">
          <span className="counter">{count.toLocaleString()}+</span>
          <span>sign ups in the past 24 hours</span>
        </div>
      </div>
    </div>
  );
}

export default App;
