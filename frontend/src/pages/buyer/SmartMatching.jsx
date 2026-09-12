import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { matchingApi } from '../../api/matching';
import { ordersApi } from '../../api/orders';
import { requirementsApi } from '../../api/requirements';
import { formatPurity, parsePurity, formatCurrency } from '../../utils/formatters';
import './SmartMatching.css';

function parseLocation(r) {
  if (!r) return { city: '—', state: '', formatted: '—' };
  if (r.deliveryCity && r.deliveryState) {
    return { city: r.deliveryCity, state: r.deliveryState, formatted: `${r.deliveryCity}, ${r.deliveryState}` };
  }
  if (r.deliveryCity) {
    return { city: r.deliveryCity, state: r.deliveryState || '', formatted: r.deliveryCity };
  }
  if (r.deliveryAddress) {
    const parts = r.deliveryAddress.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (parts[parts.length - 1].toLowerCase() === 'india' && parts.length >= 3) {
        const city = parts[parts.length - 3];
        const state = parts[parts.length - 2];
        return { city, state, formatted: `${city}, ${state}` };
      }
      const city = parts[parts.length - 2];
      const state = parts[parts.length - 1];
      return { city, state, formatted: `${city}, ${state}` };
    }
    return { city: r.deliveryAddress, state: '', formatted: r.deliveryAddress };
  }
  return { city: '—', state: '', formatted: '—' };
}

export function SmartMatching() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [requirement, setRequirement] = useState(null);
  const [matchData, setMatchData] = useState(null);
  const [selectedProposalIndex, setSelectedProposalIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [procuring, setProcuring] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [reqRes, matchRes] = await Promise.all([
          requirementsApi.getById(id),
          matchingApi.getMatches(id),
        ]);
        setRequirement(reqRes?.data || reqRes);
        setMatchData(matchRes?.data || matchRes);
      } catch (err) {
        setError(err.message || 'Failed to load matching data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Available proposals: multi-supplier composite matches or single-supplier matches
  const multiMatches = matchData?.multiSupplierMatches || [];
  const singleMatches = matchData?.singleSupplierMatches || [];

  // Active selected proposal
  const activeProposal = multiMatches[selectedProposalIndex] || singleMatches[selectedProposalIndex] || null;

  const rawMatches =
    activeProposal?.contributingLots ||
    (activeProposal ? [activeProposal] : []) ||
    matchData?.matches ||
    [];

  const normalizedMatches = rawMatches.map((m, idx) => ({
    key: m.listingId || m.listing?.id || idx,
    listingId: m.listingId || m.listing?.id,
    batchId: m.batchId || m.listing?.batch?.id || m.batch?.id,
    batchNumber: m.batchNumber || m.listing?.batch?.batchNumber || '—',
    sellerName: m.sellerName || m.listing?.batch?.company?.name || 'Seller',
    quantity: Number(m.contributingQuantity || m.offeredQuantity || m.allocatedQuantity || m.quantity || 0),
    purity: parsePurity(m.purityPercentage ?? m.listing?.batch?.purityPercentage ?? m.listing?.batch?.purity ?? m.purity),
    pricePerUnit: Number(m.pricePerTon || m.listing?.pricePerUnit || m.price || 0),
    landedUnitCost: Number(m.landedCostPerTon || m.landedUnitCost || m.pricePerTon || 0),
    distanceKm: m.distanceKm != null ? Math.round(Number(m.distanceKm)) : null,
    location: m.listing?.batch?.storageLocationCity || (m.distanceKm != null ? `${Math.round(Number(m.distanceKm))} km away` : '—'),
    hasCertificate: Boolean(m.hasCertificate || m.certificate || m.listing?.batch?.certificate),
    score: m.score || m.singleScore || m.matchScore || '—',
  }));

  const qtyRequired = Number(requirement?.targetQuantity ?? requirement?.quantityRequired ?? matchData?.targetQuantity ?? 0);
  const minPurity = Number(requirement?.minPurity ?? matchData?.minPurity ?? 0);
  const totalAllocated = normalizedMatches.reduce((s, m) => s + m.quantity, 0);
  const pctFulfilled = qtyRequired > 0 ? Math.round((totalAllocated / qtyRequired) * 100) : 0;

  const weightedPurity = activeProposal?.weightedAveragePurity != null
    ? Number(activeProposal.weightedAveragePurity).toFixed(1)
    : (normalizedMatches.length > 0 && totalAllocated > 0
      ? (normalizedMatches.reduce((s, m) => s + (m.purity || 0) * m.quantity, 0) / totalAllocated).toFixed(1)
      : null);

  const activeScore = activeProposal?.score ?? matchData?.bestMatchScore ?? 0;
  const activeRating = activeProposal?.rating ?? (activeScore >= 90 ? 'Excellent' : activeScore >= 75 ? 'Good' : 'Moderate');
  const scoreBreakdown = activeProposal?.scoreBreakdown;
  const deliveryFeasibility = activeProposal?.deliveryFeasibility;
  const whyThisMatch = activeProposal?.whyThisMatch || [];

  const handleProcure = async () => {
    if (procuring) return;
    setProcuring(true);
    try {
      const allocations = normalizedMatches.map((m) => ({
        listingId: m.listingId,
        batchId: m.batchId,
        quantity: m.quantity,
      }));
      await ordersApi.procureComposite({
        requirementId: id,
        deliveryLat: requirement?.deliveryLat != null ? Number(requirement.deliveryLat) : 20.5938,
        deliveryLng: requirement?.deliveryLng != null ? Number(requirement.deliveryLng) : 78.9629,
        deliveryAddress: requirement?.deliveryAddress || 'Buyer Warehouse',
        allocations,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Procurement failed');
    } finally {
      setProcuring(false);
    }
  };

  if (loading) {
    return (
      <div className="page-enter">
        <div className="skeleton skeleton-heading" style={{ marginBottom: 'var(--space-8)' }} />
        <div className="skeleton" style={{ height: '400px' }} />
      </div>
    );
  }

  if (error && !matchData) {
    return (
      <div className="page-enter">
        <div className="card empty-state">
          <h3>Unable to Load Matches</h3>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <div className="eyebrow">Smart Matching Engine</div>
          <h2>Multi-Supplier Intelligent Fulfillment</h2>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Back</button>
      </div>

      {/* Requirement Summary */}
      <div className="card matching-requirement-summary">
        <div className="match-summary-grid">
          <div>
            <span className="match-label">Quantity Required</span>
            <span className="match-value-lg">{qtyRequired > 0 ? `${qtyRequired} T` : '—'}</span>
          </div>
          <div>
            <span className="match-label">Min Purity</span>
            <span className="match-value-lg">{minPurity > 0 ? `${minPurity}%` : '—'}</span>
          </div>
          <div>
            <span className="match-label">Delivery Destination</span>
            <span className="match-value-lg">{parseLocation(requirement).formatted}</span>
          </div>
          <div>
            <span className="match-label">Fulfillment Feasibility</span>
            <span className="match-value-lg match-pct">{pctFulfilled}% Fulfilled</span>
          </div>
        </div>
        <div className="progress-bar" style={{ marginTop: 'var(--space-4)' }}>
          <div className="progress-fill progress-fill-success" style={{ width: `${Math.min(pctFulfilled, 100)}%` }} />
        </div>
      </div>

      {/* Proposal Selector Tabs (if multiple proposals exist) */}
      {multiMatches.length > 1 && (
        <div className="proposal-tabs-container" style={{ marginBottom: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)' }}>
          {multiMatches.map((p, idx) => (
            <button
              key={p.proposalId || idx}
              className={`btn ${selectedProposalIndex === idx ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setSelectedProposalIndex(idx)}
            >
              {p.proposalTitle || `Option ${idx + 1}`} — {p.score}/100 Match
            </button>
          ))}
        </div>
      )}

      {/* Smart Match Score & Explainability Hero Card */}
      {activeProposal && (
        <div className="card match-score-hero" style={{ marginBottom: 'var(--space-6)', borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <span className="eyebrow" style={{ margin: 0 }}>Explainable Match Score</span>
                {deliveryFeasibility && (
                  <span
                    className={`badge ${
                      deliveryFeasibility.status === 'FEASIBLE'
                        ? 'badge-success'
                        : deliveryFeasibility.status === 'TIGHT'
                        ? 'badge-warning'
                        : 'badge-danger'
                    }`}
                  >
                    {deliveryFeasibility.label}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-primary-light, #10b981)' }}>
                  {activeScore}/100
                </span>
                <span className="badge badge-primary" style={{ fontSize: 'var(--text-sm)' }}>
                  {activeRating} Match
                </span>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  Rule-based deterministic ranking across 6 dimensions
                </span>
              </div>
            </div>

            {deliveryFeasibility && (
              <div style={{ textAlign: 'right', maxWidth: '340px' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
                  Cryogenic Delivery SLA
                </div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  ~{deliveryFeasibility.estimatedTransitHours}h Turnaround Estimate
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  {deliveryFeasibility.explanation}
                </div>
              </div>
            )}
          </div>

          {/* Score Factor Breakdown Chips */}
          {scoreBreakdown && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 'var(--space-3)',
                marginTop: 'var(--space-5)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--color-border-light)',
              }}
            >
              <div className="score-factor-pill">
                <span className="factor-name">Quantity Fit</span>
                <span className="factor-val">{scoreBreakdown.quantityFit.score}/25 • {scoreBreakdown.quantityFit.rating}</span>
              </div>
              <div className="score-factor-pill">
                <span className="factor-name">Purity Fit</span>
                <span className="factor-val">{scoreBreakdown.purityFit.score}/20 • {scoreBreakdown.purityFit.rating}</span>
              </div>
              <div className="score-factor-pill">
                <span className="factor-name">Price Competitiveness</span>
                <span className="factor-val">{scoreBreakdown.priceCompetitiveness.score}/20 • {scoreBreakdown.priceCompetitiveness.rating}</span>
              </div>
              <div className="score-factor-pill">
                <span className="factor-name">Logistics Distance</span>
                <span className="factor-val">{scoreBreakdown.distanceEfficiency.score}/15 • {scoreBreakdown.distanceEfficiency.rating}</span>
              </div>
              <div className="score-factor-pill">
                <span className="factor-name">Readiness & CoA</span>
                <span className="factor-val">{scoreBreakdown.availability.score}/10 • {scoreBreakdown.availability.rating}</span>
              </div>
              <div className="score-factor-pill">
                <span className="factor-name">Delivery Feasibility</span>
                <span className="factor-val">{scoreBreakdown.deliveryFeasibility.score}/10 • {scoreBreakdown.deliveryFeasibility.rating}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* "Why this match?" Explanation Box */}
      {whyThisMatch.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 'var(--space-6)',
            background: 'rgba(16, 185, 129, 0.04)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Why this match recommendation?
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              (Transparent matching criteria)
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-2)' }}>
            {whyThisMatch.map((reason, idx) => (
              <div key={idx} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>✓</span>
                <span>{reason.replace(/^✓\s*/, '')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allocation Visual */}
      {normalizedMatches.length > 0 ? (
        <>
          <div className="matching-allocation-visual">
            {normalizedMatches.map((m, i) => {
              const pct = qtyRequired > 0 ? (m.quantity / qtyRequired) * 100 : 0;
              return (
                <div className="allocation-block" key={m.key || i} style={{ flex: pct || 1 }}>
                  <div className="alloc-bar" style={{ background: i === 0 ? 'var(--green-700)' : i === 1 ? 'var(--teal-600)' : 'var(--green-500)' }}>
                    <span className="alloc-qty">{m.quantity} T</span>
                  </div>
                  <div className="alloc-info">
                    <span className="alloc-company">{m.sellerName}</span>
                    <span className="alloc-purity">{m.purity != null ? `${m.purity}% purity` : '—'}</span>
                    <span className="alloc-price">₹{m.landedUnitCost.toLocaleString()}/T Landed</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-4 matching-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="metric-label">Weighted Purity</div>
              <div className="metric-value">{formatPurity(weightedPurity)}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="metric-label">Suppliers Pooled</div>
              <div className="metric-value">{normalizedMatches.length}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="metric-label">Total Volume Fulfilled</div>
              <div className="metric-value">{totalAllocated} T</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="metric-label">Avg Landed Unit Cost</div>
              <div className="metric-value">
                {activeProposal?.averageLandedCostPerTon
                  ? `₹${Math.round(activeProposal.averageLandedCostPerTon).toLocaleString()}/T`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Match Details Table */}
          <div className="card" style={{ marginTop: 'var(--space-6)' }}>
            <div className="card-header">
              <h3>Participating Supplier Batches</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier Plant</th>
                  <th>Batch Number</th>
                  <th>Quantity</th>
                  <th>CO₂ Purity</th>
                  <th>Landed Unit Cost</th>
                  <th>Distance</th>
                  <th>CoA Status</th>
                  <th>Fit Score</th>
                </tr>
              </thead>
              <tbody>
                {normalizedMatches.map((m, i) => (
                  <tr key={m.key || i}>
                    <td><strong>{m.sellerName}</strong></td>
                    <td className="text-mono">{m.batchNumber}</td>
                    <td>{m.quantity} T</td>
                    <td>{formatPurity(m.purity)}</td>
                    <td className="text-mono">₹{m.landedUnitCost.toLocaleString()}/T</td>
                    <td>{m.location}</td>
                    <td>
                      {m.hasCertificate ? (
                        <span className="badge badge-success" style={{ fontSize: '11px' }}>
                          CoA Available
                        </span>
                      ) : (
                        <span className="badge" style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)' }}>
                          Pending Upload
                        </span>
                      )}
                    </td>
                    <td><span className="badge badge-primary">{m.score}/100</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Procure CTA */}
          {error && <div className="auth-error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}
          <div className="matching-cta" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button className="btn btn-primary btn-lg" onClick={handleProcure} disabled={procuring}>
              {procuring ? 'Allocating & Processing...' : `Procure Pooled Supply — ${totalAllocated} T (${pctFulfilled}% Demand)`}
            </button>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              No inventory reserved until procurement is confirmed. Atomic concurrency checks protect batch balances.
            </span>
          </div>
        </>
      ) : (
        <div className="card empty-state" style={{ marginTop: 'var(--space-6)' }}>
          <h3>No Feasible Matches Found</h3>
          <p>{matchData?.summaryNote || 'No suppliers currently match your requirement. Try adjusting your criteria or check back later.'}</p>
          <button className="btn btn-primary" onClick={() => navigate('/marketplace')}>Browse Marketplace</button>
        </div>
      )}
    </div>
  );
}
