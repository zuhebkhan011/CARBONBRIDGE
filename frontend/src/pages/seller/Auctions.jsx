import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auctionsApi } from '../../api/auctions';
import { formatBatchPurity, formatQuantity, formatMoney } from '../../utils/formatters';

function formatTimeRemaining(closingTime, status) {
  if (status !== 'OPEN') {
    return status === 'SETTLED' ? 'Settled' : status === 'FINALIZING' ? 'Finalizing' : 'Closed';
  }
  if (!closingTime) return '—';
  const diff = new Date(closingTime).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function Auctions() {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'CLOSED'
  const [currentTime] = useState(() => Date.now());
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await auctionsApi.list();
        setAuctions(res?.data || res || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, []);

  const items = Array.isArray(auctions) ? auctions : [];

  const filteredItems = items.filter(a => {
    const isClosed = a.status !== 'OPEN' || new Date(a.closingTime).getTime() <= currentTime;
    if (filter === 'ACTIVE') return !isClosed;
    if (filter === 'CLOSED') return isClosed;
    return true;
  });

  const handleCreateAuction = () => {
    navigate('/seller/listings/new?type=AUCTION', { state: { type: 'AUCTION' } });
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>Auctions</h2>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>Manage competitive bidding for your captured CO₂ lots</p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateAuction}>
          + Create Auction
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        <button
          type="button"
          className={`btn btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('ALL')}
        >
          All ({items.length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${filter === 'ACTIVE' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('ACTIVE')}
        >
          Active ({items.filter(a => a.status === 'OPEN' && new Date(a.closingTime).getTime() > currentTime).length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${filter === 'CLOSED' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilter('CLOSED')}
        >
          Completed / Closed ({items.filter(a => a.status !== 'OPEN' || new Date(a.closingTime).getTime() <= currentTime).length})
        </button>
      </div>

      {loading ? (
        <div className="grid grid-2">
          {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: '220px' }} />)}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card empty-state" style={{ padding: 'var(--space-12) var(--space-6)' }}>
          <h3>No auctions found</h3>
          <p style={{ margin: 'var(--space-2) 0 var(--space-5)' }}>
            {filter === 'ALL'
              ? 'You have not created any auctions yet. Start an auction to receive competitive bids.'
              : filter === 'ACTIVE'
              ? 'No active auctions right now.'
              : 'No completed or closed auctions.'}
          </p>
          <button className="btn btn-primary" onClick={handleCreateAuction}>
            Create Auction
          </button>
        </div>
      ) : (
        <div className="grid grid-2">
          {filteredItems.map(a => {
            const batch = a.listing?.batch || a.batch;
            const isClosed = a.status !== 'OPEN' || new Date(a.closingTime).getTime() <= currentTime;
            const auctionQty = a.quantity ?? a.listing?.quantity;
            const highestBid = a.currentHighestBid;
            const reserve = a.baseReservePrice ?? a.reservePrice;
            const purity = formatBatchPurity(batch);

            return (
              <div
                className="card card-interactive"
                key={a.id}
                onClick={() => navigate(`/seller/auctions/${a.id}`)}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>
                    {batch?.batchNumber || a.listing?.batch?.batchNumber || `Auction ${a.id.slice(0, 8)}`}
                  </span>
                  <span className={`badge ${!isClosed ? 'badge-success' : a.status === 'SETTLED' ? 'badge-info' : 'badge-neutral'}`}>
                    {!isClosed ? 'ACTIVE' : a.status}
                  </span>
                </div>

                <div className="grid grid-3" style={{ gap: 'var(--space-4)', margin: 'var(--space-2) 0' }}>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quantity</span>
                    <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 'var(--space-1)' }}>
                      {formatQuantity(auctionQty)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Purity</span>
                    <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 'var(--space-1)' }}>
                      {purity}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {highestBid ? 'Highest Bid' : 'Reserve Price'}
                    </span>
                    <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-primary)', marginTop: 'var(--space-1)' }}>
                      {formatMoney(highestBid ?? reserve)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)', marginTop: 'auto' }}>
                  <span>
                    <strong>{a._count?.bids ?? a.bids?.length ?? 0}</strong> { (a._count?.bids ?? a.bids?.length ?? 0) === 1 ? 'bid placed' : 'bids placed' }
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontWeight: 600, color: isClosed ? 'var(--color-text-muted)' : 'var(--color-warning)' }}>
                    ⏱ {formatTimeRemaining(a.closingTime, a.status)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
