import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auctionsApi } from '../../api/auctions';
import { useAuth } from '../../context/AuthContext';
import { formatMoney, formatQuantity } from '../../utils/formatters';
import { resolveLocationCoordinates } from '../../utils/geo';

export function AuctionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');

  const loadAuction = async () => {
    try {
      const res = await auctionsApi.getById(id);
      setAuction(res?.data || res);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { loadAuction(); }, [id]);

  const handleBid = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!auction) {
      setError('Auction details not available.');
      return;
    }

    if (auction.status !== 'OPEN') {
      setError(`Auction is not open. Current status: ${auction.status}.`);
      return;
    }

    if (auction.closingTime && new Date(auction.closingTime).getTime() <= Date.now()) {
      setError('Auction duration has ended. No further bids are accepted.');
      return;
    }

    if (user?.companyId && auction.sellerId === user.companyId) {
      setError('Sellers cannot place bids on their own auctions.');
      return;
    }

    const trimmed = String(bidAmount ?? '').trim();
    if (!trimmed) {
      setError('Please enter a bid amount.');
      return;
    }

    const amount = Number(trimmed);
    if (!Number.isFinite(amount) || isNaN(amount)) {
      setError('Please enter a valid numeric bid amount.');
      return;
    }

    if (amount <= 0) {
      setError('Bid amount must be greater than zero.');
      return;
    }

    const hasBids = Array.isArray(auction.bids) && auction.bids.length > 0;
    const minNext = hasBids
      ? Number(auction.currentHighestBid || 0) + Number(auction.minBidIncrement || 50)
      : Number(auction.baseReservePrice || 0);

    if (amount < minNext) {
      setError(`Bid must be at least ₹${minNext.toLocaleString()}/T.`);
      return;
    }

    setBidding(true);
    try {
      await auctionsApi.placeBid(id, { amountPerTon: amount });
      setBidAmount('');
      await loadAuction();
    } catch (err) {
      const msg =
        err.data?.error?.details?.[0]?.message ||
        err.data?.error?.message ||
        err.data?.message ||
        err.message ||
        'Bid failed';
      setError(msg);
    } finally {
      setBidding(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const bids = auction.bids || [];
      const winningBid = bids
        .slice()
        .sort((a, b) => Number(b.amountPerTon ?? b.bidAmount ?? 0) - Number(a.amountPerTon ?? a.bidAmount ?? 0))[0];
      if (winningBid) {
        const buyerCompany = winningBid.buyerCompany || winningBid.buyer?.company;
        const address = buyerCompany?.address || 'Ahmedabad, Gujarat';
        const resolved = resolveLocationCoordinates(address, buyerCompany?.latitude, buyerCompany?.longitude);
        await auctionsApi.finalize(id, {
          deliveryLat: resolved.latitude,
          deliveryLng: resolved.longitude,
          deliveryAddress: address,
        });
        await loadAuction();
      }
    } catch (err) {
      setError(err.message || 'Finalization failed');
    }
    setFinalizing(false);
  };

  if (loading) return <div className="page-enter"><div className="skeleton" style={{ height: '400px' }} /></div>;
  if (!auction) return <div className="page-enter"><div className="card empty-state"><h3>Auction not found</h3></div></div>;

  const bids = Array.isArray(auction.bids) ? auction.bids : [];
  const isSeller = user?.role === 'SELLER';

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 'var(--space-2)' }}>← Back</button>
          <h2>Auction Details</h2>
        </div>
        <span className={`badge ${auction.status === 'OPEN' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-4)' }}>{auction.status}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)' }}>
        <div>
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="grid grid-3" style={{ gap: 'var(--space-6)' }}>
              <div><span className="match-label">Quantity</span><span className="match-value-lg">{formatQuantity(auction.quantity ?? auction.listing?.quantity)}</span></div>
              <div><span className="match-label">Reserve Price</span><span className="match-value-lg">{formatMoney(auction.baseReservePrice ?? auction.reservePrice)}</span></div>
              <div><span className="match-label">Highest Bid</span><span className="match-value-lg" style={{ color: 'var(--color-success)' }}>{formatMoney(auction.currentHighestBid)}</span></div>
            </div>
          </div>

          {/* Auction Intelligence & Activity Analytics */}
          {auction.insights && (
            <div
              className="card"
              style={{
                marginBottom: 'var(--space-6)',
                background: 'rgba(16, 185, 129, 0.03)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderLeft: '4px solid var(--color-primary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span className="badge badge-primary" style={{ fontSize: '11px' }}>Auction Intelligence</span>
                  <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>Live Bidding Analytics</strong>
                </div>
                <span
                  className={`badge ${
                    auction.insights.bidTrend === 'Accelerating'
                      ? 'badge-success'
                      : auction.insights.bidTrend === 'Active'
                      ? 'badge-info'
                      : 'badge-neutral'
                  }`}
                  style={{ fontSize: '11px' }}
                >
                  Trend: {auction.insights.bidTrend}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                <div>
                  <span className="match-label">Total Bids Placed</span>
                  <div style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>{auction.insights.bidActivityCount} bids</div>
                </div>
                <div>
                  <span className="match-label">Unique Bidders</span>
                  <div style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>{auction.insights.uniqueBiddersCount} verified buyers</div>
                </div>
                <div>
                  <span className="match-label">Market Advisory</span>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    {auction.insights.advisoryMessage}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bid History */}
          <div className="card">
            <div className="card-header"><h3>Bid History</h3></div>
            {bids.length === 0 ? (
              <p style={{ fontSize: 'var(--text-sm)' }}>No bids placed yet.</p>
            ) : (
              <table className="data-table">
                <thead><tr><th>Bidder</th><th>Amount</th><th>Time</th></tr></thead>
                <tbody>
                  {bids
                    .slice()
                    .sort((a, b) => Number(b.amountPerTon ?? b.bidAmount ?? 0) - Number(a.amountPerTon ?? a.bidAmount ?? 0))
                    .map((b, i) => {
                      const amount = b.amountPerTon ?? b.bidAmount ?? b.amount;
                      const bidderName = b.buyer?.fullName || b.buyer?.company?.name || b.bidder?.company?.name || b.bidder?.fullName || 'Bidder';
                      return (
                        <tr key={b.id || i}>
                          <td>{bidderName}</td>
                          <td className="text-mono" style={{ fontWeight: 700, color: i === 0 ? 'var(--color-success)' : 'inherit' }}>
                            {formatMoney(amount)}
                          </td>
                          <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            {b.createdAt ? new Date(b.createdAt).toLocaleString() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          {/* Buyer: Place Bid */}
          {!isSeller && auction.status === 'OPEN' && (
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ marginBottom: 'var(--space-4)' }}>Place Bid</h3>
              <form onSubmit={handleBid} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="input-group">
                  <label className="input-label">Your Bid (₹/T)</label>
                  <input type="number" className="input" value={bidAmount} onChange={e => setBidAmount(e.target.value)} placeholder="e.g. 2500" required step="any" />
                  <span className="input-hint">Min increment: {formatMoney(auction.minBidIncrement || 50)}</span>
                </div>
                {error && <div className="auth-error">{error}</div>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={bidding}>
                  {bidding ? 'Placing...' : 'Place Bid'}
                </button>
              </form>
            </div>
          )}

          {/* Seller: Finalize */}
          {isSeller && auction.status === 'OPEN' && bids.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 'var(--space-4)' }}>Finalize Auction</h3>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>Accept the highest bid and close the auction.</p>
              {error && <div className="auth-error" style={{ marginBottom: 'var(--space-3)' }}>{error}</div>}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleFinalize} disabled={finalizing}>
                {finalizing
                  ? 'Finalizing...'
                  : `Accept ${formatMoney(bids.slice().sort((a, b) => Number(b.amountPerTon ?? b.bidAmount ?? 0) - Number(a.amountPerTon ?? a.bidAmount ?? 0))[0]?.amountPerTon ?? bids[0]?.bidAmount ?? auction.currentHighestBid)} Bid`}
              </button>
            </div>
          )}

          {auction.status !== 'OPEN' && (
            <div className="card" style={{ textAlign: 'center' }}>
              <span className="badge badge-info" style={{ fontSize: 'var(--text-sm)' }}>Auction {auction.status}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
