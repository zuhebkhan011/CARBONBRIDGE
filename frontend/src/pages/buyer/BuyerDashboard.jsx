import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requirementsApi } from '../../api/requirements';
import { ordersApi } from '../../api/orders';
import { shipmentsApi } from '../../api/shipments';
import { insightsApi } from '../../api/insights';
import './BuyerDashboard.css';

function parseLocation(r) {
  if (r.deliveryCity && r.deliveryState) {
    return {
      city: r.deliveryCity,
      state: r.deliveryState,
      formatted: `${r.deliveryCity}, ${r.deliveryState}`,
    };
  }
  if (r.deliveryCity) {
    return {
      city: r.deliveryCity,
      state: r.deliveryState || '',
      formatted: r.deliveryCity,
    };
  }
  if (r.deliveryAddress) {
    const parts = r.deliveryAddress.split(',').map(s => s.trim()).filter(Boolean);
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

function getStatusBadge(status) {
  switch (status) {
    case 'OPEN':
    case 'ACTIVE':
      return 'badge-success';
    case 'MATCHED':
    case 'PARTIALLY_FULFILLED':
    case 'FULFILLED':
      return 'badge-info';
    case 'CANCELLED':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
}

export function BuyerDashboard() {
  const [requirements, setRequirements] = useState([]);
  const [orders, setOrders] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [reqRes, ordRes, shipRes, mktRes] = await Promise.allSettled([
          requirementsApi.list(),
          ordersApi.list(),
          shipmentsApi.list(),
          insightsApi.getMarketplace(),
        ]);
        const rList = (reqRes.status === 'fulfilled' ? reqRes.value?.data || reqRes.value : null) || [];
        setRequirements(rList);
        setOrders((ordRes.status === 'fulfilled' ? ordRes.value?.data || ordRes.value : null) || []);
        setShipments((shipRes.status === 'fulfilled' ? shipRes.value?.data || shipRes.value : null) || []);

        const mktInsights = (mktRes.status === 'fulfilled' ? mktRes.value?.data?.insights : []) || [];

        // If there's an active requirement, fetch demand-side insights
        const firstActive = rList.find((r) => ['OPEN', 'MATCHED', 'PARTIALLY_FULFILLED', 'ACTIVE'].includes(r.status));
        if (firstActive?.id) {
          try {
            const reqInsightsRes = await insightsApi.getBuyerInsights(firstActive.id);
            const reqInsights = reqInsightsRes?.data?.insights || [];
            setInsights([...reqInsights, ...mktInsights].slice(0, 3));
          } catch {
            setInsights(mktInsights.slice(0, 3));
          }
        } else {
          setInsights(mktInsights.slice(0, 3));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const reqs = Array.isArray(requirements) ? requirements : [];
  const ords = Array.isArray(orders) ? orders : [];
  const ships = Array.isArray(shipments) ? shipments : [];

  const activeReqs = reqs.filter(r => ['OPEN', 'MATCHED', 'PARTIALLY_FULFILLED', 'ACTIVE'].includes(r.status));
  const activeShipments = ships.filter(s => s.status !== 'RECEIVED' && s.status !== 'DELIVERED');
  const totalProcured = ords.reduce((sum, o) => sum + (Number(o.totalQuantity ?? o.quantity) || 0), 0);

  if (loading) {
    return (
      <div className="page-enter">
        <div className="page-header"><div className="skeleton skeleton-heading" /></div>
        <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-metric" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>Overview of your CO₂ procurement activity</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/requirements/new')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Post Requirement
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-4 dashboard-metrics">
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--color-accent-light)', color: 'var(--color-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          </div>
          <div className="metric-label">Active Requirements</div>
          <div className="metric-value">{activeReqs.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div className="metric-label">Total Orders</div>
          <div className="metric-value">{ords.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div className="metric-label">Active Shipments</div>
          <div className="metric-value">{activeShipments.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--color-secondary-light)', color: 'var(--color-secondary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          </div>
          <div className="metric-label">CO₂ Procured</div>
          <div className="metric-value">{totalProcured}<span className="metric-sub" style={{ marginLeft: '4px' }}>T</span></div>
        </div>
      </div>

      {/* CarbonBridge Insights Widget */}
      {insights.length > 0 && (
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
            {activeReqs.length > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/matching/${activeReqs[0].id}`)}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                View Smart Matches →
              </button>
            )}
          </div>
          <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {insights.map((msg, i) => (
              <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>•</span>
                <span>{msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Requirements */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <h3>My Requirements</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/requirements/new')}>+ New</button>
        </div>
        {reqs.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <p>No requirements posted yet.</p>
            <button className="btn btn-primary" onClick={() => navigate('/requirements/new')}>Post Your First Requirement</button>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quantity</th>
                  <th>Purity</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reqs.map(r => {
                  const loc = parseLocation(r);
                  const rawQty = r.targetQuantity != null ? r.targetQuantity : r.quantityRequired;
                  const qty = rawQty != null && !isNaN(Number(rawQty)) ? Number(rawQty) : null;
                  const rawPurity = r.minPurity;
                  const purity = rawPurity != null && !isNaN(Number(rawPurity)) ? Number(rawPurity) : null;

                  return (
                    <tr key={r.id}>
                      <td><strong>{qty != null ? `${qty} T` : '—'}</strong></td>
                      <td>{purity != null ? `${purity}%+` : '—'}</td>
                      <td>{loc.formatted}</td>
                      <td>
                        <span className={`badge ${getStatusBadge(r.status)}`}>
                          {r.status || 'OPEN'}
                        </span>
                      </td>
                      <td>
                        {['OPEN', 'MATCHED', 'PARTIALLY_FULFILLED', 'ACTIVE'].includes(r.status) && (
                          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/matching/${r.id}`)}>
                            View Matches
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Orders */}
      {ords.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Recent Orders</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>View All</button>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Quantity</th>
                  <th>Total Price</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ords.slice(0, 5).map(o => (
                  <tr key={o.id}>
                    <td className="text-mono" style={{ fontSize: 'var(--text-xs)' }}>{o.id.slice(0, 8)}...</td>
                    <td><strong>{Number(o.totalQuantity)} T</strong></td>
                    <td>₹{Number(o.totalPrice).toLocaleString()}</td>
                    <td><span className={`badge ${o.status === 'CONFIRMED' ? 'badge-success' : 'badge-warning'}`}>{o.status}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => navigate(`/orders/${o.id}`)}>Details</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
