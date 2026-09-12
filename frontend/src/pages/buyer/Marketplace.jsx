import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingsApi } from '../../api/listings';
import { formatBatchPurity } from '../../utils/formatters';

export function Marketplace() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await listingsApi.browse();
        const list = res?.data?.items || res?.data || res?.items || res || [];
        setListings(Array.isArray(list) ? list : []);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const items = Array.isArray(listings) ? listings : [];

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>CO₂ Marketplace</h2>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>Browse available CO₂ listings from verified suppliers</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-3">
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: '280px' }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <h3>No Listings Available</h3>
          <p>Check back soon for new CO₂ supply listings.</p>
        </div>
      ) : (
        <div className="grid grid-3">
          {items.map(listing => (
            <div className="card card-interactive" key={listing.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                  {listing.batch?.company?.name || 'Seller'}
                </span>
                <span className={`badge ${listing.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`}>
                  {listing.listingType}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                <div>
                  <span style={{ display: 'block', fontSize: 'var(--text-xl)', fontWeight: 700 }}>{Number(listing.quantity)} T</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantity</span>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: 'var(--text-xl)', fontWeight: 700 }}>{formatBatchPurity(listing)}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Purity</span>
                </div>
              </div>

              <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--neutral-75)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>INR</span>
                <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-family-mono)' }}>
                  {listing.pricePerUnit ? Number(listing.pricePerUnit).toLocaleString() : '—'}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>/ T</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {listing.batch?.storageLocationCity || '—'}, {listing.batch?.storageLocationState || ''}
              </div>

              <div style={{ marginTop: 'auto' }}>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => navigate(`/listings/${listing.id}`)}>
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
