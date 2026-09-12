import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { batchesApi } from '../../api/batches';
import { listingsApi } from '../../api/listings';
import { shipmentsApi } from '../../api/shipments';
import { insightsApi } from '../../api/insights';
import { formatBatchPurity } from '../../utils/formatters';

export function SellerDashboard() {
  const [batches, setBatches] = useState([]);
  const [listings, setListings] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [opportunitiesData, setOpportunitiesData] = useState(null);
  const [marketplaceInsights, setMarketplaceInsights] = useState([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [bRes, lRes, sRes, oppRes, mktRes] = await Promise.allSettled([
          batchesApi.list(),
          listingsApi.browse(),
          shipmentsApi.list(),
          insightsApi.getSellerOpportunities(),
          insightsApi.getMarketplace(),
        ]);
        setBatches((bRes.status === 'fulfilled' ? bRes.value?.data || bRes.value : null) || []);
        setListings((lRes.status === 'fulfilled' ? lRes.value?.data?.items || lRes.value?.data || lRes.value?.items || lRes.value : null) || []);
        setShipments((sRes.status === 'fulfilled' ? sRes.value?.data || sRes.value : null) || []);
        setOpportunitiesData(oppRes.status === 'fulfilled' ? oppRes.value?.data : null);
        setMarketplaceInsights((mktRes.status === 'fulfilled' ? mktRes.value?.data?.insights : []) || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const bArr = Array.isArray(batches) ? batches : [];
  const lArr = Array.isArray(listings) ? listings : [];
  const sArr = Array.isArray(shipments) ? shipments : [];

  const totalCaptured = bArr.reduce((s, b) => s + Number(b.capturedQuantity || 0), 0);
  const totalAvailable = bArr.reduce((s, b) => s + Number(b.availableQuantity || 0), 0);
  const activeListings = lArr.filter(l => l.status === 'ACTIVE');
  const pendingShipments = sArr.filter(s => s.status !== 'RECEIVED');
  const opportunities = opportunitiesData?.opportunities || [];

  if (loading) return <div className="page-enter"><div className="grid grid-4">{[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-metric" />)}</div></div>;

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>Seller Dashboard</h2>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>Real-time inventory and market matchmaking</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/seller/batches/new')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Register New Batch
        </button>
      </div>

      <div className="grid grid-4 dashboard-metrics" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="metric-card">
          <div className="metric-label">Total Captured</div>
          <div className="metric-value">{totalCaptured} <span className="metric-sub">T</span></div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Available Inventory</div>
          <div className="metric-value" style={{ color: 'var(--color-success)' }}>{totalAvailable} <span className="metric-sub">T</span></div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Active Listings</div>
          <div className="metric-value">{activeListings.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Pending Shipments</div>
          <div className="metric-value">{pendingShipments.length}</div>
        </div>
      </div>

      {/* CarbonBridge Insights Widget */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--space-6)',
          background: 'rgba(16, 185, 129, 0.03)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderLeft: '4px solid var(--color-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span className="badge badge-primary" style={{ fontSize: '11px' }}>Marketplace Intelligence</span>
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>CarbonBridge Insights</strong>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Updated in real-time from active marketplace demand
          </span>
        </div>
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>•</span>
            <span>{opportunitiesData?.headline || `${totalAvailable} T inventory available across your registered batches.`}</span>
          </div>
          {marketplaceInsights.slice(0, 2).map((msg, idx) => (
            <div key={idx} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 'bold' }}>•</span>
              <span>{msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Matching Buyer Opportunities */}
      {opportunities.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3>Matching Buyer Opportunities</h3>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                Active buyer requirements with compatible purity and feasible logistics from your plant
              </p>
            </div>
            <span className="badge badge-success" style={{ fontSize: '11px' }}>
              {opportunities.length} Match{opportunities.length > 1 ? 'es' : ''} Detected
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            {opportunities.map((opp) => (
              <div
                key={`${opp.requirementId}-${opp.matchingBatchId}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-surface-hover, rgba(255,255,255,0.03))',
                  border: '1px solid var(--color-border-light, rgba(255,255,255,0.08))',
                  borderRadius: 'var(--radius-md, 8px)',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span className="text-mono" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>
                      {opp.displayId}
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {opp.buyerName}
                    </span>
                    <span className="badge" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)' }}>
                      {opp.deliveryLocation}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    Required: <strong>{opp.targetQuantity} T</strong> CO₂ • Min Purity: <strong>{opp.minPurity}%</strong>
                    {' '}• Your Batch: <strong>{opp.batchNumber}</strong> ({opp.availableBatchQuantity} T @ {opp.purityPercentage}%)
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {opp.fitDescription} • ~{Math.round(opp.distanceKm)} km away
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span className="badge badge-primary" style={{ fontSize: 'var(--text-xs)' }}>
                      {opp.matchScore}/100 Match
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedOpportunity(opp)}
                    style={{ fontSize: '12px' }}
                  >
                    View Match
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opportunity Detail Modal (Read-Only / Advisory) */}
      {selectedOpportunity && (
        <div className="modal-backdrop" onClick={() => setSelectedOpportunity(null)}>
          <div className="modal-card card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', width: '90%' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Match Opportunity Details</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedOpportunity(null)}>✕</button>
            </div>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <span className="match-label">Buyer Requirement</span>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{selectedOpportunity.buyerName} ({selectedOpportunity.displayId})</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Destination: {selectedOpportunity.deliveryLocation}</div>
              </div>
              <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                <div>
                  <span className="match-label">Required Specifications</span>
                  <div style={{ fontSize: 'var(--text-sm)' }}>Quantity: <strong>{selectedOpportunity.targetQuantity} T</strong></div>
                  <div style={{ fontSize: 'var(--text-sm)' }}>Min Purity: <strong>{selectedOpportunity.minPurity}%</strong></div>
                </div>
                <div>
                  <span className="match-label">Your Matched Batch</span>
                  <div style={{ fontSize: 'var(--text-sm)' }}>Batch: <strong>{selectedOpportunity.batchNumber}</strong></div>
                  <div style={{ fontSize: 'var(--text-sm)' }}>Available: <strong>{selectedOpportunity.availableBatchQuantity} T ({selectedOpportunity.purityPercentage}%)</strong></div>
                </div>
              </div>
              <div>
                <span className="match-label">Logistics & Fit</span>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Distance: ~{Math.round(selectedOpportunity.distanceKm)} km from plant. {selectedOpportunity.fitDescription}
                </div>
              </div>
              <div style={{ padding: 'var(--space-3)', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                ℹ️ Advisory Matchmaking only. Inventory is never automatically allocated or locked. Buyers initiate multi-supplier composite procurement based on ranked match scores.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedOpportunity(null)}>Close</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setSelectedOpportunity(null);
                  navigate('/seller/inventory');
                }}
              >
                Go to Batch Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Bar */}
      {totalCaptured > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-header"><h3>Inventory Overview</h3></div>
          <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', overflow: 'hidden', height: '32px' }}>
            <div style={{ width: `${(totalAvailable / totalCaptured) * 100}%`, background: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 'var(--text-xs)', fontWeight: 600, minWidth: '40px' }}>
              Available ({totalAvailable}T)
            </div>
            <div style={{ flex: 1, background: 'var(--neutral-200, rgba(255,255,255,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
              Allocated ({totalCaptured - totalAvailable}T)
            </div>
          </div>
        </div>
      )}

      {/* Recent Batches */}
      <div className="card">
        <div className="card-header">
          <h3>Registered CO₂ Batches</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/seller/inventory')}>View All</button>
        </div>
        {bArr.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <p>No batches registered yet.</p>
            <button className="btn btn-primary" onClick={() => navigate('/seller/batches/new')}>Register First Batch</button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Batch Number</th><th>Captured</th><th>Available</th><th>Purity</th><th>Status</th></tr>
            </thead>
            <tbody>
              {bArr.slice(0, 5).map(b => (
                <tr key={b.id}>
                  <td className="text-mono" style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{b.batchNumber || b.id.slice(0, 10)}</td>
                  <td><strong>{Number(b.capturedQuantity)} T</strong></td>
                  <td>{Number(b.availableQuantity)} T</td>
                  <td>{formatBatchPurity(b)}</td>
                  <td><span className={`badge ${b.status === 'AVAILABLE' || b.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`}>{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
