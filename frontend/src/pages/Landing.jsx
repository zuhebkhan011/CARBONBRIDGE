import { useNavigate } from 'react-router-dom';
import { useScrollReveal } from '../hooks/useScrollReveal';
import './Landing.css';

function RevealSection({ children, className = '', stagger = false }) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={`reveal ${stagger ? 'reveal-stagger' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      {/* ── Nav ──────────────────────────────────────────── */}
      <nav className="landing-nav">
        <div className="container flex items-center justify-between">
          <div className="landing-nav-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="var(--color-primary)"/>
              <path d="M16 6L22 12L16 18L10 12Z" fill="white" opacity="0.9"/>
              <path d="M16 14L22 20L16 26L10 20Z" fill="white" opacity="0.6"/>
            </svg>
            <span>CarbonBridge</span>
          </div>
          <div className="landing-nav-actions">
            <button className="btn btn-ghost" onClick={() => navigate('/login')}>Login</button>
            <button className="btn btn-primary" onClick={() => navigate('/register')}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* ── S1: Hero ─────────────────────────────────────── */}
      <section className="hero-section">
        <div className="container">
          <div className="hero-content fade-up">
            <div className="eyebrow">B2B CO2 Marketplace</div>
            <h1>Turn Captured CO<sub>2</sub> Into a Valuable Resource.</h1>
            <p className="hero-subtitle">
              CarbonBridge connects captured CO<sub>2</sub> from industrial emitters with businesses that can put it to productive use.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/marketplace')}>
                Explore Marketplace
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => navigate('/requirements/new')}>
                Post a CO<sub>2</sub> Requirement
              </button>
            </div>
          </div>
          <div className="hero-visual fade-up" style={{ animationDelay: '200ms' }}>
            <div className="hero-flow">
              <div className="flow-node flow-emitter">
                <div className="flow-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16"/></svg>
                </div>
                <span>Industrial Emitters</span>
              </div>
              <div className="flow-arrow">
                <svg width="40" height="24" viewBox="0 0 40 24" fill="none"><path d="M0 12h36M30 6l6 6-6 6" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="flow-node flow-co2">
                <div className="flow-icon flow-icon-primary">
                  <span className="flow-molecule">CO<sub>2</sub></span>
                </div>
                <span>Captured Carbon</span>
              </div>
              <div className="flow-arrow">
                <svg width="40" height="24" viewBox="0 0 40 24" fill="none"><path d="M0 12h36M30 6l6 6-6 6" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="flow-node flow-bridge">
                <div className="flow-icon flow-icon-bridge">
                  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                    <path d="M16 6L22 12L16 18L10 12Z" fill="white" opacity="0.9"/>
                    <path d="M16 14L22 20L16 26L10 20Z" fill="white" opacity="0.5"/>
                  </svg>
                </div>
                <span>CarbonBridge</span>
              </div>
              <div className="flow-arrow">
                <svg width="40" height="24" viewBox="0 0 40 24" fill="none"><path d="M0 12h36M30 6l6 6-6 6" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="flow-node flow-buyer">
                <div className="flow-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </div>
                <span>Utilization Businesses</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── S2: Problem ──────────────────────────────────── */}
      <section className="section landing-section-alt">
        <div className="container">
          <RevealSection>
            <div className="section-header">
              <div className="eyebrow">The Problem</div>
              <h2>Captured Carbon Shouldn't Become a Cost Center.</h2>
              <p>Industrial CO<sub>2</sub> capture is growing, but captured carbon often goes to waste due to market fragmentation.</p>
            </div>
          </RevealSection>
          <RevealSection stagger>
            <div className="grid grid-3 problem-cards">
              <div className="card problem-card">
                <div className="problem-number">01</div>
                <h3>Limited Buyer Visibility</h3>
                <p>Emitters have no efficient way to find businesses that need CO<sub>2</sub> for production.</p>
              </div>
              <div className="card problem-card">
                <div className="problem-number">02</div>
                <h3>Fragmented Supplier Discovery</h3>
                <p>Buyers waste time contacting individual plants instead of sourcing from a unified market.</p>
              </div>
              <div className="card problem-card">
                <div className="problem-number">03</div>
                <h3>Difficult Logistics</h3>
                <p>Coordinating cryogenic CO<sub>2</sub> transport across multiple suppliers and routes is complex.</p>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── S3: How It Works ─────────────────────────────── */}
      <section className="section">
        <div className="container">
          <RevealSection>
            <div className="section-header">
              <div className="eyebrow">How It Works</div>
              <h2>One Platform. From Capture to Delivery.</h2>
            </div>
          </RevealSection>
          <RevealSection stagger>
            <div className="steps-grid">
              {[
                { num: '01', title: 'List CO\u2082', desc: 'Sellers register captured CO\u2082 batches with purity and quantity details.' },
                { num: '02', title: 'Find the Right Match', desc: 'Our matching engine pools multiple suppliers to fulfill buyer requirements.' },
                { num: '03', title: 'Buy or Bid', desc: 'Purchase at fixed prices or participate in seller-side auctions.' },
                { num: '04', title: 'Move & Track', desc: 'Consolidated logistics with real-time shipment tracking to delivery.' },
              ].map(step => (
                <div className="step-item" key={step.num}>
                  <div className="step-num">{step.num}</div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── S4: Multi-Supplier Fulfillment (Hero Section) ── */}
      <section className="section landing-section-dark">
        <div className="container">
          <RevealSection>
            <div className="section-header" style={{ color: 'white' }}>
              <div className="eyebrow" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--green-400)' }}>Smart Matching</div>
              <h2 style={{ color: 'white' }}>One Requirement. Multiple Suppliers.</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)' }}>A single buyer demand is automatically matched and fulfilled by pooling supply from multiple sellers.</p>
            </div>
          </RevealSection>
          <RevealSection>
            <div className="fulfillment-visual">
              <div className="fulfillment-demand">
                <div className="fulfillment-badge">Buyer Needs</div>
                <div className="fulfillment-qty">500 T</div>
                <div className="fulfillment-label">CO<sub>2</sub> Required</div>
              </div>

              <div className="fulfillment-arrow-down">
                <svg width="24" height="48" viewBox="0 0 24 48" fill="none"><path d="M12 0v40M6 34l6 6 6-6" stroke="var(--green-400)" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>

              <div className="fulfillment-suppliers">
                <div className="supplier-card">
                  <div className="supplier-name">UltraTech Cement</div>
                  <div className="supplier-qty">100 T</div>
                  <div className="supplier-purity">78% purity</div>
                </div>
                <div className="supplier-plus">+</div>
                <div className="supplier-card">
                  <div className="supplier-name">Tata Steel</div>
                  <div className="supplier-qty">200 T</div>
                  <div className="supplier-purity">72% purity</div>
                </div>
                <div className="supplier-plus">+</div>
                <div className="supplier-card">
                  <div className="supplier-name">Reliance Petrochem</div>
                  <div className="supplier-qty">200 T</div>
                  <div className="supplier-purity">74% purity</div>
                </div>
              </div>

              <div className="fulfillment-arrow-down">
                <svg width="24" height="48" viewBox="0 0 24 48" fill="none"><path d="M12 0v40M6 34l6 6 6-6" stroke="var(--green-400)" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>

              <div className="fulfillment-result">
                <div className="result-check">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div className="result-qty">500 T Fulfilled</div>
                <div className="result-pct">100% Matched</div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── S5: Marketplace Preview ──────────────────────── */}
      <section className="section">
        <div className="container">
          <RevealSection>
            <div className="section-header">
              <div className="eyebrow">Marketplace</div>
              <h2>Browse Available CO<sub>2</sub> Supply</h2>
              <p>Real-time listings from verified industrial emitters across India.</p>
            </div>
          </RevealSection>
          <RevealSection stagger>
            <div className="grid grid-3 marketplace-preview">
              {[
                { company: 'UltraTech Cement', qty: '100 T', purity: '78%', price: '2,400', location: 'Ankleshwar, Gujarat', cert: true },
                { company: 'Tata Steel', qty: '200 T', purity: '72%', price: '2,350', location: 'Hazira, Surat', cert: true },
                { company: 'Reliance Petrochem', qty: '200 T', purity: '74%', price: '2,380', location: 'Dahej, Bharuch', cert: true },
              ].map((listing, i) => (
                <div className="card card-interactive listing-preview-card" key={i}>
                  <div className="listing-header">
                    <span className="listing-company">{listing.company}</span>
                    {listing.cert && <span className="badge badge-success">Certificate</span>}
                  </div>
                  <div className="listing-stats">
                    <div className="listing-stat">
                      <span className="listing-stat-value">{listing.qty}</span>
                      <span className="listing-stat-label">Quantity</span>
                    </div>
                    <div className="listing-stat">
                      <span className="listing-stat-value">{listing.purity}</span>
                      <span className="listing-stat-label">Purity</span>
                    </div>
                  </div>
                  <div className="listing-price">
                    <span className="price-symbol">INR</span>
                    <span className="price-value">{listing.price}</span>
                    <span className="price-unit">/ T</span>
                  </div>
                  <div className="listing-location">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {listing.location}
                  </div>
                  <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-4)' }} onClick={() => navigate('/login')}>
                    View Details
                  </button>
                </div>
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── S6: Logistics ────────────────────────────────── */}
      <section className="section landing-section-alt">
        <div className="container">
          <RevealSection>
            <div className="section-header">
              <div className="eyebrow">Logistics</div>
              <h2>Smarter Routes. Lower Costs.</h2>
              <p>Consolidate shipments from one seller to multiple buyers on a single optimized route.</p>
            </div>
          </RevealSection>
          <RevealSection>
            <div className="logistics-visual">
              <div className="logistics-comparison">
                <div className="logistics-option logistics-separate">
                  <h4>Separate Routes</h4>
                  <div className="route-lines">
                    <div className="route-line"><span className="route-dot seller-dot" /> <span className="route-dash" /> <span className="route-dot buyer-dot" /> Buyer 1</div>
                    <div className="route-line"><span className="route-dot seller-dot" /> <span className="route-dash" /> <span className="route-dot buyer-dot" /> Buyer 2</div>
                    <div className="route-line"><span className="route-dot seller-dot" /> <span className="route-dash" /> <span className="route-dot buyer-dot" /> Buyer 3</div>
                  </div>
                  <div className="route-stat">3 separate trips</div>
                </div>
                <div className="logistics-vs">VS</div>
                <div className="logistics-option logistics-consolidated">
                  <h4>Consolidated Route</h4>
                  <div className="route-chain">
                    <span className="route-dot seller-dot" />
                    <span className="route-dash-long" />
                    <span className="route-dot buyer-dot" />
                    <span className="route-dash-short" />
                    <span className="route-dot buyer-dot" />
                    <span className="route-dash-short" />
                    <span className="route-dot buyer-dot" />
                  </div>
                  <div className="route-stat route-stat-highlight">1 optimized trip</div>
                </div>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── S7: Trust ────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <RevealSection>
            <div className="section-header">
              <div className="eyebrow">Trust & Transparency</div>
              <h2>Built for Enterprise Confidence</h2>
            </div>
          </RevealSection>
          <RevealSection stagger>
            <div className="trust-grid">
              {[
                { icon: '📊', title: 'Batch-Level Inventory', desc: 'Every CO\u2082 batch is tracked with quantity, purity, and storage details.' },
                { icon: '📄', title: 'Certificate of Analysis', desc: 'Third-party lab certificates attached to every registered batch.' },
                { icon: '💰', title: 'Transparent Pricing', desc: 'Rule-based advisory pricing with clear breakdowns.' },
                { icon: '🚚', title: 'Shipment Tracking', desc: 'Real-time status from allocation to delivery and receipt.' },
                { icon: '🔒', title: 'Allocation Integrity', desc: 'Atomic inventory deductions prevent overselling.' },
              ].map((item, i) => (
                <div className="trust-item" key={i}>
                  <div className="trust-icon-wrap">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── S8: Final CTA ────────────────────────────────── */}
      <section className="section landing-cta-section">
        <div className="container">
          <RevealSection>
            <div className="cta-block">
              <h2>Ready to Put Captured CO<sub>2</sub> to Work?</h2>
              <p>Join the marketplace connecting industrial emitters with utilization businesses.</p>
              <div className="hero-actions" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/marketplace')}>Explore Marketplace</button>
                <button className="btn btn-secondary btn-lg" onClick={() => navigate('/register')}>Join CarbonBridge</button>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ── S9: Footer ───────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="container flex items-center justify-between">
          <div className="landing-nav-logo" style={{ gap: 'var(--space-2)' }}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="var(--color-primary)"/>
              <path d="M16 6L22 12L16 18L10 12Z" fill="white" opacity="0.9"/>
              <path d="M16 14L22 20L16 26L10 20Z" fill="white" opacity="0.6"/>
            </svg>
            <span style={{ fontSize: 'var(--text-sm)' }}>CarbonBridge</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
            Team AESTRO &middot; HackOut 2026 &middot; PS8
          </p>
        </div>
      </footer>
    </div>
  );
}
