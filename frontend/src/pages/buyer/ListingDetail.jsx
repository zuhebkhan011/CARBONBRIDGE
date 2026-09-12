import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listingsApi } from '../../api/listings';
import { ordersApi } from '../../api/orders';
import { auctionsApi } from '../../api/auctions';
import { useAuth } from '../../context/AuthContext';
import { formatBatchPurity } from '../../utils/formatters';

export function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [bidding, setBidding] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [purchaseSuccess, setPurchaseSuccess] = useState(null);

  // Fixed Price Purchase State
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState(23.0225);
  const [deliveryLng, setDeliveryLng] = useState(72.5714);
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);

  // Auction State
  const [bidAmount, setBidAmount] = useState('');

  const loadListing = async () => {
    try {
      const res = await listingsApi.getById(id);
      const data = res?.data || res;
      setListing(data);

      // Initialize quantity default
      const available = Number(data.quantity || data.batch?.availableQuantity || 0);
      if (available > 0) {
        setPurchaseQty(prev => (prev === 1 || prev > available) ? Math.min(100, available) : prev);
      }
    } catch (e) {
      setError(e.message || 'Failed to load listing');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadListing();
  }, [id]);

  // Pre-fill user company delivery defaults
  useEffect(() => {
    if (user?.company) {
      if (user.company.address) setDeliveryAddress(user.company.address);
      if (user.company.latitude != null) setDeliveryLat(Number(user.company.latitude));
      if (user.company.longitude != null) setDeliveryLng(Number(user.company.longitude));
    }
  }, [user]);

  // Handle Fixed-Price Purchase
  const handlePurchase = async () => {
    setError('');
    setSuccessMsg('');

    const qty = Number(purchaseQty);
    const maxListingQty = Number(listing.quantity || 0);
    const maxBatchQty = Number(listing.batch?.availableQuantity ?? maxListingQty);

    if (!qty || isNaN(qty) || qty <= 0) {
      setError('Purchase quantity must be a positive number.');
      return;
    }
    if (qty > maxListingQty) {
      setError(`Requested quantity (${qty} T) exceeds available listing quantity (${maxListingQty} T).`);
      return;
    }
    if (qty > maxBatchQty) {
      setError(`Requested quantity (${qty} T) exceeds available batch capacity (${maxBatchQty} T).`);
      return;
    }

    const trimmedAddress = (deliveryAddress || user?.company?.address || '').trim();
    if (!trimmedAddress || trimmedAddress.length < 5) {
      setError('Please provide a valid delivery address (at least 5 characters).');
      setShowDeliveryDetails(true);
      return;
    }

    const lat = Number(deliveryLat);
    const lng = Number(deliveryLng);
    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
      setError('Please enter valid geographic coordinates for delivery.');
      setShowDeliveryDetails(true);
      return;
    }

    setPurchasing(true);
    try {
      const res = await ordersApi.procureFixed({
        listingId: id,
        quantity: qty,
        deliveryAddress: trimmedAddress,
        deliveryLat: lat,
        deliveryLng: lng,
      });
      setPurchaseSuccess(res?.data || res || true);
      setSuccessMsg(`✓ Purchase successful! ${qty} T of CO₂ allocated from ${listing.batch?.company?.name || 'Seller'}.`);
      await loadListing();
    } catch (e) {
      setError(e.message || 'Purchase failed');
    }
    setPurchasing(false);
  };

  // Handle Auction Bidding
  const handleBid = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccessMsg('');

    const auction = listing?.auction;
    if (!auction?.id) {
      setError('Auction details are not available for this listing.');
      return;
    }

    if (auction.status !== 'OPEN') {
      setError(`Auction is not active. Current status: ${auction.status}.`);
      return;
    }

    if (auction.closingTime && new Date(auction.closingTime).getTime() <= Date.now()) {
      setError('Auction duration has ended. No further bids are accepted.');
      return;
    }

    if (user?.companyId && (auction.sellerId === user.companyId || listing.sellerId === user.companyId)) {
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
      await auctionsApi.placeBid(auction.id, { amountPerTon: amount });
      setSuccessMsg(`✓ Bid of ₹${amount.toLocaleString()}/T successfully placed!`);
      setBidAmount('');
      await loadListing();
    } catch (err) {
      const msg =
        err.data?.error?.details?.[0]?.message ||
        err.data?.error?.message ||
        err.data?.message ||
        err.message ||
        'Failed to submit bid';
      setError(msg);
    } finally {
      setBidding(false);
    }
  };

  if (loading) {
    return (
      <div className="page-enter">
        <div className="skeleton" style={{ height: '400px' }} />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="page-enter">
        <div className="card empty-state">
          <h3>Listing Not Found</h3>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/marketplace')}>
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  const isAuction = listing.sellingMethod === 'AUCTION' || listing.listingType === 'AUCTION';
  const isFixedPrice = !isAuction;
  const auction = listing.auction;
  const isOwnListing = Boolean(
    user?.company?.id && (listing.sellerId === user.company.id || listing.seller?.id === user.company.id)
  );

  const pricePerTon = Number(listing.pricePerUnit ?? listing.pricePerTon ?? 0);
  const availableQty = Number(listing.quantity || 0);
  const totalPurchaseValue = Number(purchaseQty || 0) * pricePerTon;

  // Auction specific derivations
  const hasAuctionBids = Boolean(auction?.bids && auction.bids.length > 0);
  const highestBid = Number(auction?.currentHighestBid || auction?.baseReservePrice || 0);
  const minIncrement = Number(auction?.minBidIncrement || 50);
  const nextMinBid = hasAuctionBids ? highestBid + minIncrement : Number(auction?.baseReservePrice || 0);
  const isAuctionClosed = auction?.status !== 'OPEN' || (auction?.closingTime && new Date() >= new Date(auction.closingTime));
  const isUserHighestBidder = Boolean(
    hasAuctionBids && auction.bids[0]?.buyerId === user?.id
  );

  // Time remaining helper
  const getTimeRemainingStr = (closingTime) => {
    if (!closingTime) return '—';
    const diff = new Date(closingTime).getTime() - Date.now();
    if (diff <= 0) return 'Auction ended';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h remaining`;
    }
    return `${hours}h ${mins}m remaining`;
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/marketplace')}
            style={{ marginBottom: 'var(--space-2)' }}
          >
            ← Marketplace
          </button>
          <h2>{listing.batch?.company?.name || listing.seller?.name || 'CO₂ Listing'}</h2>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span
            className={`badge ${isAuction ? 'badge-primary' : 'badge-neutral'}`}
            style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-4)' }}
          >
            {isAuction ? 'AUCTION' : 'FIXED PRICE'}
          </span>
          <span
            className={`badge ${listing.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`}
            style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-4)' }}
          >
            {listing.status}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)' }}>
        {/* Left Column: Technical & Batch Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-6)' }}>Batch Details</h3>
            <div className="grid grid-2" style={{ gap: 'var(--space-5)' }}>
              <div>
                <span className="match-label">Offered Lot Quantity</span>
                <span className="match-value-lg">{availableQty} T</span>
              </div>
              <div>
                <span className="match-label">Purity</span>
                <span className="match-value-lg">{formatBatchPurity(listing)}</span>
              </div>
              <div>
                <span className="match-label">Batch Number</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-family-mono)' }}>
                  {listing.batch?.batchNumber || '—'}
                </span>
              </div>
              <div>
                <span className="match-label">Batch Total Available</span>
                <span style={{ fontWeight: 600 }}>
                  {Number(listing.batch?.availableQuantity ?? availableQty)} T
                </span>
              </div>
              <div>
                <span className="match-label">Capture Method</span>
                <span style={{ fontWeight: 600 }}>{listing.batch?.captureMethod || 'Direct Flue Gas Capture'}</span>
              </div>
              <div>
                <span className="match-label">Storage Location</span>
                <span style={{ fontWeight: 600 }}>
                  {listing.batch?.storageLocationCity || listing.seller?.address?.split(',')?.[0]?.trim() || 'Gujarat'},{' '}
                  {listing.batch?.storageLocationState || 'India'}
                </span>
              </div>
              <div>
                <span className="match-label">Storage Pressure</span>
                <span style={{ fontWeight: 600 }}>
                  {listing.batch?.storagePressureBar ? `${listing.batch.storagePressureBar} bar` : '18.0 bar'}
                </span>
              </div>
              <div>
                <span className="match-label">Storage Temperature</span>
                <span style={{ fontWeight: 600 }}>
                  {listing.batch?.storageTemperatureC ? `${listing.batch.storageTemperatureC}°C` : '-22.0°C'}
                </span>
              </div>
            </div>
          </div>

          {/* Auction Bidding Activity Table (if Auction) */}
          {isAuction && auction && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h3 style={{ margin: 0 }}>Auction Bidding Activity</h3>
                <span className="badge badge-info" style={{ fontSize: 'var(--text-xs)' }}>
                  {auction.bids?.length || 0} {auction.bids?.length === 1 ? 'Bid' : 'Bids'} Placed
                </span>
              </div>

              {!hasAuctionBids ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', margin: 'var(--space-3) 0' }}>
                  No bids have been placed yet. Be the first to place an opening bid at or above the reserve price!
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--neutral-150)', textAlign: 'left' }}>
                        <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Bidder</th>
                        <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Amount / Ton</th>
                        <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Time</th>
                        <th style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-muted)' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auction.bids.map((b, idx) => {
                        const isLeading = idx === 0;
                        const isUserBid = b.buyerId === user?.id || b.buyer?.id === user?.id;
                        return (
                          <tr
                            key={b.id || idx}
                            style={{
                              borderBottom: '1px solid var(--neutral-100)',
                              backgroundColor: isLeading ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: 'var(--space-3)' }}>
                              <span style={{ fontWeight: isLeading ? 700 : 500 }}>
                                {isUserBid ? 'You' : (b.buyer?.fullName || b.buyer?.company?.name || 'Verified Buyer')}
                              </span>
                            </td>
                            <td style={{ padding: 'var(--space-3)', fontFamily: 'var(--font-family-mono)', fontWeight: 600 }}>
                              ₹{Number(b.amountPerTon).toLocaleString()}
                            </td>
                            <td style={{ padding: 'var(--space-3)', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                              {b.createdAt ? new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td style={{ padding: 'var(--space-3)' }}>
                              {isLeading ? (
                                <span className="badge badge-success" style={{ fontSize: '11px' }}>Highest Bid</span>
                              ) : (
                                <span className="badge badge-neutral" style={{ fontSize: '11px' }}>Outbid</span>
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
          )}
        </div>

        {/* Right Column: Transaction Action Console */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* ============================================================ */}
          {/* 1. FIXED-PRICE PROCUREMENT ACTION CONSOLE                   */}
          {/* ============================================================ */}
          {isFixedPrice && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div>
                <span className="match-label">Fixed Unit Price</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>₹</span>
                  <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'var(--font-family-mono)' }}>
                    {pricePerTon.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>/ Tonne</span>
                </div>
              </div>

              {/* Purchase Quantity Selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                  <label htmlFor="purchase-qty" className="match-label" style={{ margin: 0 }}>
                    Purchase Quantity (T)
                  </label>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Max: {availableQty} T
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <input
                    id="purchase-qty"
                    type="number"
                    min="1"
                    max={availableQty}
                    step="1"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                    disabled={purchasing || listing.status !== 'ACTIVE' || availableQty <= 0}
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neutral-200)',
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: 'var(--text-base)',
                      fontWeight: 600,
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPurchaseQty(availableQty)}
                    disabled={purchasing || availableQty <= 0}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Calculated Total Price */}
              <div style={{ padding: 'var(--space-3)', background: 'var(--neutral-75)', borderRadius: 'var(--radius-md)' }}>
                <span className="match-label">Estimated Total Value</span>
                <span className="match-value-lg" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-primary)' }}>
                  ₹{Math.max(0, totalPurchaseValue).toLocaleString()}
                </span>
              </div>

              {/* Delivery Details Toggle & Inputs */}
              <div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowDeliveryDetails(!showDeliveryDetails)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: 'var(--space-1) 0' }}
                >
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                    Delivery Destination {showDeliveryDetails ? '▲' : '▼'}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {deliveryAddress ? `${deliveryAddress.slice(0, 22)}...` : 'Configure'}
                  </span>
                </button>

                {showDeliveryDetails && (
                  <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div>
                      <span className="match-label">Delivery Address</span>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Plant / Offtake site address"
                        style={{
                          width: '100%',
                          padding: 'var(--space-2)',
                          fontSize: 'var(--text-xs)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--neutral-200)',
                        }}
                      />
                    </div>
                    <div className="grid grid-2" style={{ gap: 'var(--space-2)' }}>
                      <div>
                        <span className="match-label">Latitude</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={deliveryLat}
                          onChange={(e) => setDeliveryLat(e.target.value)}
                          style={{
                            width: '100%',
                            padding: 'var(--space-2)',
                            fontSize: 'var(--text-xs)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--neutral-200)',
                            fontFamily: 'var(--font-family-mono)',
                          }}
                        />
                      </div>
                      <div>
                        <span className="match-label">Longitude</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={deliveryLng}
                          onChange={(e) => setDeliveryLng(e.target.value)}
                          style={{
                            width: '100%',
                            padding: 'var(--space-2)',
                            fontSize: 'var(--text-xs)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--neutral-200)',
                            fontFamily: 'var(--font-family-mono)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Feedback messages */}
              {error && <div className="auth-error" style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2)' }}>{error}</div>}
              {successMsg && (
                <div
                  style={{
                    padding: 'var(--space-3)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid var(--color-success)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-success)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}
                >
                  {successMsg}
                </div>
              )}

              {/* Action Buttons */}
              {purchaseSuccess ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <button
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                    onClick={() => navigate('/orders')}
                  >
                    View in Orders
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%' }}
                    onClick={() => navigate('/marketplace')}
                  >
                    Continue Browsing
                  </button>
                </div>
              ) : isOwnListing ? (
                <div className="card" style={{ background: 'var(--neutral-75)', textAlign: 'center', padding: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Your company created this listing. Sellers cannot purchase their own CO₂ supply.
                  </span>
                </div>
              ) : (
                listing.status === 'ACTIVE' && availableQty > 0 && (
                  <button
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                    onClick={handlePurchase}
                    disabled={purchasing || availableQty <= 0}
                  >
                    {purchasing ? 'Processing Allocation...' : 'Purchase Now'}
                  </button>
                )
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* 2. AUCTION BIDDING ACTION CONSOLE (NEVER SHOW "PURCHASE NOW")*/}
          {/* ============================================================ */}
          {isAuction && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div>
                <span className="match-label">Current Highest Bid</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>₹</span>
                  <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-primary)', fontFamily: 'var(--font-family-mono)' }}>
                    {highestBid.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>/ Tonne</span>
                </div>
              </div>

              <div className="grid grid-2" style={{ gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--neutral-75)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <span className="match-label">Starting Price</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-family-mono)', fontSize: 'var(--text-sm)' }}>
                    ₹{Number(auction?.baseReservePrice || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="match-label">Min. Increment</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-family-mono)', fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
                    +₹{minIncrement.toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <span className="match-label">Closing Time</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-1)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    {auction?.closingTime ? new Date(auction.closingTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                  <span
                    className={`badge ${isAuctionClosed ? 'badge-neutral' : 'badge-warning'}`}
                    style={{ fontSize: '11px' }}
                  >
                    {getTimeRemainingStr(auction?.closingTime)}
                  </span>
                </div>
              </div>

              {isUserHighestBidder && (
                <div
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-success)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}
                >
                  ✓ You currently hold the highest bid on this auction!
                </div>
              )}

              {/* Bid Submission Form */}
              {!isAuctionClosed && !isOwnListing && (
                <form onSubmit={handleBid} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                      <label htmlFor="bid-amount" className="match-label" style={{ margin: 0 }}>
                        Your Bid Amount (₹/T)
                      </label>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        Min: ₹{nextMinBid.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <input
                        id="bid-amount"
                        type="number"
                        step="1"
                        placeholder={`e.g. ${nextMinBid}`}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        disabled={bidding}
                        style={{
                          width: '100%',
                          padding: 'var(--space-2) var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--neutral-200)',
                          fontFamily: 'var(--font-family-mono)',
                          fontSize: 'var(--text-base)',
                          fontWeight: 600,
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setBidAmount(String(nextMinBid))}
                        disabled={bidding}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        Min Bid
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', marginTop: 'var(--space-2)' }}
                    disabled={bidding}
                  >
                    {bidding ? 'Submitting Bid...' : 'Place Bid'}
                  </button>
                </form>
              )}

              {isOwnListing && (
                <div className="card" style={{ background: 'var(--neutral-75)', textAlign: 'center', padding: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Your company is the seller of this auction. Sellers cannot place bids on their own listings.
                  </span>
                </div>
              )}

              {isAuctionClosed && !isOwnListing && (
                <div className="card" style={{ background: 'var(--neutral-75)', textAlign: 'center', padding: 'var(--space-3)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    This auction is closed. Finalization and winning allocation are being processed.
                  </span>
                </div>
              )}

              {/* Feedback messages */}
              {error && <div className="auth-error" style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2)' }}>{error}</div>}
              {successMsg && (
                <div
                  style={{
                    padding: 'var(--space-3)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid var(--color-success)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-success)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}
                >
                  {successMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
