import { useEffect, useState } from 'react';
import { listingsApi } from '../../api/listings';
import { auctionsApi } from '../../api/auctions';
import { ordersApi } from '../../api/orders';
import { shipmentsApi } from '../../api/shipments';

export function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [lRes, aRes, oRes, sRes] = await Promise.allSettled([
          listingsApi.browse(), auctionsApi.list(), ordersApi.list(), shipmentsApi.list()
        ]);
        const listings = (lRes.status === 'fulfilled' ? lRes.value?.data || lRes.value : []) || [];
        const auctions = (aRes.status === 'fulfilled' ? aRes.value?.data || aRes.value : []) || [];
        const orders = (oRes.status === 'fulfilled' ? oRes.value?.data || oRes.value : []) || [];
        const shipments = (sRes.status === 'fulfilled' ? sRes.value?.data || sRes.value : []) || [];

        const lArr = Array.isArray(listings) ? listings : [];
        const aArr = Array.isArray(auctions) ? auctions : [];
        const oArr = Array.isArray(orders) ? orders : [];
        const sArr = Array.isArray(shipments) ? shipments : [];

        setStats({
          listings: lArr.length,
          activeListings: lArr.filter(l => l.status === 'ACTIVE').length,
          auctions: aArr.length,
          orders: oArr.length,
          shipments: sArr.length,
          activeShipments: sArr.filter(s => s.status !== 'RECEIVED').length,
          totalTraded: oArr.reduce((s, o) => s + Number(o.totalQuantity || 0), 0),
          totalValue: oArr.reduce((s, o) => s + Number(o.totalPrice || 0), 0),
        });
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="page-enter"><div className="grid grid-4">{[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-metric" />)}</div></div>;

  return (
    <div className="page-enter">
      <div className="page-header">
        <h2>Admin Dashboard</h2>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--color-accent-light)', color: 'var(--color-primary)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
          <div className="metric-label">Active Listings</div>
          <div className="metric-value">{stats.activeListings}</div>
          <div className="metric-sub">{stats.listings} total</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          </div>
          <div className="metric-label">Auctions</div>
          <div className="metric-value">{stats.auctions}</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div className="metric-label">Orders</div>
          <div className="metric-value">{stats.orders}</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div className="metric-label">Active Shipments</div>
          <div className="metric-value">{stats.activeShipments}</div>
          <div className="metric-sub">{stats.shipments} total</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="metric-card" style={{ textAlign: 'center' }}>
          <div className="metric-label">Total CO₂ Traded</div>
          <div className="metric-value" style={{ fontSize: 'var(--text-4xl)' }}>{stats.totalTraded} <span style={{ fontSize: 'var(--text-lg)' }}>T</span></div>
        </div>
        <div className="metric-card" style={{ textAlign: 'center' }}>
          <div className="metric-label">Total Transaction Value</div>
          <div className="metric-value" style={{ fontSize: 'var(--text-4xl)', fontFamily: 'var(--font-family-mono)' }}>₹{stats.totalValue.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
