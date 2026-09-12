import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { batchesApi } from '../../api/batches';
import { listingsApi } from '../../api/listings';
import { auctionsApi } from '../../api/auctions';
import { pricingApi } from '../../api/pricing';
import { formatBatchPurity } from '../../utils/formatters';

export function CreateListing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const requestedType = (searchParams.get('type') || location.state?.type || '').toUpperCase();
  const [listingType, setListingType] = useState(requestedType === 'AUCTION' ? 'AUCTION' : 'FIXED');
  const [minDateTime] = useState(() => {
    const now = new Date(Date.now() + 60000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });

  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [advisoryPrice, setAdvisoryPrice] = useState(null);
  const [form, setForm] = useState({
    batchId: '',
    quantity: '',
    pricePerUnit: '',
    reservePrice: '',
    minBidIncrement: '50',
    closingDate: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep listingType in sync if navigation query param or state changes
  useEffect(() => {
    if (requestedType === 'AUCTION') {
      setListingType('AUCTION');
    } else if (requestedType === 'FIXED') {
      setListingType('FIXED');
    }
  }, [requestedType]);

  // Fetch authenticated seller's available batches from the backend
  useEffect(() => {
    async function load() {
      setBatchesLoading(true);
      setError('');
      try {
        const res = await batchesApi.list();
        const rawList = res?.data || res || [];
        const list = Array.isArray(rawList) ? rawList : [];

        // Show only batches with available quantity > 0 and not depleted or expired
        const availableBatches = list.filter(b =>
          Number(b.availableQuantity || 0) > 0 &&
          b.status !== 'DEPLETED' &&
          b.status !== 'EXPIRED'
        );

        setBatches(availableBatches);
      } catch (e) {
        console.error(e);
        setError(e.message || 'Failed to load batches');
      } finally {
        setBatchesLoading(false);
      }
    }
    load();
  }, []);

  // Fetch advisory price corridor when batch or quantity is selected
  useEffect(() => {
    if (!form.batchId) {
      setAdvisoryPrice(null);
      return;
    }
    const selected = batches.find(b => b.id === form.batchId);
    if (!selected) return;

    const purity = Number(selected.purityPercentage || 75);
    const qty = Number(form.quantity || selected.availableQuantity || 100);

    if (purity > 0 && qty > 0) {
      pricingApi.getAdvisory({ purityPercentage: purity, batchQuantity: qty })
        .then(res => setAdvisoryPrice(res?.data || res))
        .catch(err => console.error('Advisory pricing error:', err));
    }
  }, [form.batchId, form.quantity, batches]);

  const handleChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    setFieldErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const handleBatchChange = (e) => {
    const selectedId = e.target.value;
    const selected = batches.find(b => b.id === selectedId);
    setForm(prev => ({
      ...prev,
      batchId: selectedId,
      quantity: selected ? String(Number(selected.availableQuantity)) : prev.quantity,
    }));
    setFieldErrors(prev => ({ ...prev, batchId: undefined, quantity: undefined }));
  };


  const handleClosingDateChange = (e) => {
    const val = e.target.value;
    setForm(prev => ({ ...prev, closingDate: val }));
    if (!val) {
      setFieldErrors(prev => ({ ...prev, closingDate: 'Auction closing time is required.' }));
    } else {
      const closing = new Date(val);
      if (isNaN(closing.getTime()) || closing.getTime() <= Date.now()) {
        setFieldErrors(prev => ({ ...prev, closingDate: 'Auction closing time must be in the future.' }));
      } else {
        setFieldErrors(prev => ({ ...prev, closingDate: undefined }));
      }
    }
  };

  const validate = () => {
    const errors = {};
    const selectedBatch = batches.find(b => b.id === form.batchId);

    // 1. Batch is selected
    if (!form.batchId) {
      errors.batchId = 'Please select an available batch.';
    }

    // 2. Quantity > 0 and <= batch available quantity
    const qty = Number(form.quantity);
    if (!form.quantity || isNaN(qty) || qty <= 0) {
      errors.quantity = 'Quantity must be greater than 0 tonnes.';
    } else if (selectedBatch && qty > Number(selectedBatch.availableQuantity)) {
      errors.quantity = `Quantity cannot exceed available batch quantity (${Number(selectedBatch.availableQuantity)} T).`;
    }

    if (listingType === 'FIXED') {
      const price = Number(form.pricePerUnit);
      if (!form.pricePerUnit || isNaN(price) || price <= 0) {
        errors.pricePerUnit = 'Price per tonne must be greater than ₹0.';
      }
    } else {
      // AUCTION validations
      const reserve = Number(form.reservePrice);
      if (!form.reservePrice || isNaN(reserve) || reserve <= 0) {
        errors.reservePrice = 'Reserve price must be greater than ₹0.';
      }

      const minInc = Number(form.minBidIncrement);
      if (!form.minBidIncrement || isNaN(minInc) || minInc <= 0) {
        errors.minBidIncrement = 'Minimum bid increment must be greater than ₹0.';
      }

      if (!form.closingDate) {
        errors.closingDate = 'Auction closing time is required.';
      } else {
        const closing = new Date(form.closingDate);
        if (isNaN(closing.getTime()) || closing.getTime() <= Date.now()) {
          errors.closingDate = 'Auction closing time must be in the future.';
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError('');
    try {
      if (listingType === 'FIXED') {
        await listingsApi.create({
          batchId: form.batchId,
          sellingMethod: 'FIXED_PRICE',
          pricePerTon: Number(form.pricePerUnit),
          quantity: Number(form.quantity),
        });
        navigate('/seller/inventory');
      } else {
        const listingRes = await listingsApi.create({
          batchId: form.batchId,
          sellingMethod: 'AUCTION',
          quantity: Number(form.quantity),
        });
        const listingId = listingRes?.data?.data?.id || listingRes?.data?.id || listingRes?.id;
        await auctionsApi.create({
          listingId,
          baseReservePrice: Number(form.reservePrice),
          minBidIncrement: Number(form.minBidIncrement),
          closingTime: new Date(form.closingDate).toISOString(),
        });
        navigate('/seller/auctions');
      }
    } catch (err) {
      setError(err.message || 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-enter">
      <div className="page-header"><h2>Create Listing</h2></div>
      <div className="card" style={{ maxWidth: '720px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {error && <div className="auth-error">{error}</div>}

          {/* Listing Type Toggle */}
          <div>
            <label className="input-label" style={{ marginBottom: 'var(--space-2)', display: 'block' }}>Listing Type</label>
            <div style={{ display: 'flex', background: 'var(--neutral-100)', borderRadius: 'var(--radius-md)', padding: '3px' }}>
              <button
                type="button"
                className={`role-btn ${listingType === 'FIXED' ? 'active' : ''}`}
                onClick={() => { setListingType('FIXED'); setFieldErrors({}); }}
              >
                Fixed Price
              </button>
              <button
                type="button"
                className={`role-btn ${listingType === 'AUCTION' ? 'active' : ''}`}
                onClick={() => { setListingType('AUCTION'); setFieldErrors({}); }}
              >
                Auction
              </button>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Select Batch</label>
            <select
              className="input"
              value={form.batchId}
              onChange={handleBatchChange}
              required
              disabled={batchesLoading || batches.length === 0}
            >
              {batchesLoading ? (
                <option value="">Loading available batches...</option>
              ) : batches.length === 0 ? (
                <option value="">No available CO₂ batches</option>
              ) : (
                <option value="">Choose an available batch...</option>
              )}
              {batches.map(b => {
                const displayId = b.batchNumber || b.id.slice(0, 8);
                const qty = Number(b.availableQuantity);
                const purity = formatBatchPurity(b);
                return (
                  <option key={b.id} value={b.id}>
                    {displayId} — {qty}T available — {purity}
                  </option>
                );
              })}
            </select>
            {fieldErrors.batchId && (
              <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)', display: 'block' }}>
                {fieldErrors.batchId}
              </span>
            )}
            {!batchesLoading && batches.length === 0 && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)' }}>
                No available CO₂ batches. <button type="button" onClick={() => navigate('/seller/batches/new')} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, textDecoration: 'underline', font: 'inherit' }}>Register a batch first.</button>
              </p>
            )}
          </div>

          <div className="input-group">
            <label className="input-label">Quantity (Tonnes)</label>
            <input
              type="number"
              className="input"
              value={form.quantity}
              onChange={(e) => {
                handleChange('quantity')(e);
                setFieldErrors(prev => ({ ...prev, quantity: undefined }));
              }}
              placeholder="e.g. 100"
              required
              min="1"
              step="any"
            />
            {fieldErrors.quantity && (
              <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)', display: 'block' }}>
                {fieldErrors.quantity}
              </span>
            )}
          </div>

          {/* Smart Advisory Pricing Corridor */}
          {advisoryPrice && (
            <div
              className="card"
              style={{
                marginBottom: 'var(--space-4)',
                background: 'rgba(16, 185, 129, 0.04)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: 'var(--space-3) var(--space-4)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)' }}>
                    Recommended Price Corridor
                  </span>
                  <span className="badge" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>
                    Rule-Based Advisory — Not AI/ML
                  </span>
                </div>
                {advisoryPrice.medianPrice && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--color-primary)' }}
                    onClick={() => {
                      const targetField = listingType === 'FIXED' ? 'pricePerUnit' : 'reservePrice';
                      setForm(prev => ({ ...prev, [targetField]: String(advisoryPrice.medianPrice) }));
                      setFieldErrors(prev => ({ ...prev, [targetField]: undefined }));
                    }}
                  >
                    Apply ₹{advisoryPrice.medianPrice}/T
                  </button>
                )}
              </div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 'var(--space-1) 0', color: 'var(--color-text-primary)' }}>
                ₹{advisoryPrice.recommendedLowerPrice?.toLocaleString()} – ₹{advisoryPrice.recommendedUpperPrice?.toLocaleString()} <span style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--color-text-muted)' }}>/ Tonne</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <span>Base: ₹{advisoryPrice.breakdown?.baseBenchmark?.min}–₹{advisoryPrice.breakdown?.baseBenchmark?.max}</span>
                <span>• Purity: {advisoryPrice.breakdown?.purityAdjustment?.amount >= 0 ? `+₹${advisoryPrice.breakdown?.purityAdjustment?.amount}` : `-₹${Math.abs(advisoryPrice.breakdown?.purityAdjustment?.amount)}`}</span>
                <span>• Volume: {advisoryPrice.breakdown?.volumeAdjustment?.percentage}%</span>
                {advisoryPrice.breakdown?.supplyDemandAdjustment?.amount !== 0 && (
                  <span>• Liquidity: +₹{advisoryPrice.breakdown?.supplyDemandAdjustment?.amount}</span>
                )}
              </div>
            </div>
          )}

          {listingType === 'FIXED' ? (
            <div className="input-group">
              <label className="input-label">Price per Tonne (₹)</label>
              <input
                type="number"
                className="input"
                value={form.pricePerUnit}
                onChange={(e) => {
                  handleChange('pricePerUnit')(e);
                  setFieldErrors(prev => ({ ...prev, pricePerUnit: undefined }));
                }}
                placeholder="e.g. 2400"
                required
                min="1"
                step="any"
              />
              {fieldErrors.pricePerUnit && (
                <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)', display: 'block' }}>
                  {fieldErrors.pricePerUnit}
                </span>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label className="input-label">Reserve Price (₹/T)</label>
                  <input
                    type="number"
                    className="input"
                    value={form.reservePrice}
                    onChange={(e) => {
                      handleChange('reservePrice')(e);
                      setFieldErrors(prev => ({ ...prev, reservePrice: undefined }));
                    }}
                    placeholder="e.g. 2200"
                    required
                    min="1"
                    step="any"
                  />
                  {fieldErrors.reservePrice && (
                    <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)', display: 'block' }}>
                      {fieldErrors.reservePrice}
                    </span>
                  )}
                </div>
                <div className="input-group" style={{ flex: 1 }}>
                  <label className="input-label">Min Bid Increment (₹)</label>
                  <input
                    type="number"
                    className="input"
                    value={form.minBidIncrement}
                    onChange={(e) => {
                      handleChange('minBidIncrement')(e);
                      setFieldErrors(prev => ({ ...prev, minBidIncrement: undefined }));
                    }}
                    placeholder="e.g. 50"
                    required
                    min="1"
                    step="any"
                  />
                  {fieldErrors.minBidIncrement && (
                    <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)', display: 'block' }}>
                      {fieldErrors.minBidIncrement}
                    </span>
                  )}
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Closing Date & Time</label>
                <input
                  type="datetime-local"
                  className="input"
                  min={minDateTime}
                  value={form.closingDate}
                  onChange={handleClosingDateChange}
                  required
                />
                {fieldErrors.closingDate && (
                  <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)', display: 'block' }}>
                    {fieldErrors.closingDate}
                  </span>
                )}
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border-light)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : listingType === 'FIXED' ? 'Create Fixed Listing' : 'Create Auction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
