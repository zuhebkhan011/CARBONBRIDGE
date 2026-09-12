import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requirementsApi } from '../../api/requirements';
import './PostRequirement.css';

const CITY_COORDS = {
  'Ahmedabad': { lat: 23.0225, lng: 72.5714 },
  'Mumbai': { lat: 19.076, lng: 72.8777 },
  'Delhi': { lat: 28.6139, lng: 77.209 },
  'Bangalore': { lat: 12.9716, lng: 77.5946 },
  'Chennai': { lat: 13.0827, lng: 80.2707 },
  'Kolkata': { lat: 22.5726, lng: 88.3639 },
  'Hyderabad': { lat: 17.385, lng: 78.4867 },
  'Pune': { lat: 18.5204, lng: 73.8567 },
  'Surat': { lat: 21.1702, lng: 72.8311 },
  'Jaipur': { lat: 26.9124, lng: 75.7873 },
  'Indore': { lat: 22.7196, lng: 75.8577 },
  'Nagpur': { lat: 21.1458, lng: 79.0882 },
  'Bhopal': { lat: 23.2599, lng: 77.4126 },
  'Visakhapatnam': { lat: 17.6868, lng: 83.2185 },
};

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function PostRequirement() {
  const navigate = useNavigate();
  const todayDateStr = getTodayDateString();
  const [form, setForm] = useState({
    quantityRequired: '', minPurity: '', deliveryCity: '', deliveryState: '',
    maxBudgetPerUnit: '', intendedUse: '', deliveryByDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Client-side past date check
    if (form.deliveryByDate && form.deliveryByDate < todayDateStr) {
      setFieldErrors({ deliveryByDate: 'Delivery date cannot be in the past.' });
      setError('Delivery date cannot be in the past.');
      return;
    }

    setLoading(true);
    try {
      const city = form.deliveryCity.trim();
      const coords = CITY_COORDS[city] || { lat: 20.59, lng: 78.96 };
      const payload = {
        targetQuantity: Number(form.quantityRequired),
        minPurity: Number(form.minPurity),
        deliveryLat: coords.lat,
        deliveryLng: coords.lng,
        deliveryAddress: `${form.deliveryCity}, ${form.deliveryState}`,
        requiredDeliveryDate: form.deliveryByDate ? new Date(`${form.deliveryByDate}T00:00:00.000Z`).toISOString() : undefined,
        budgetCeilingPerTon: form.maxBudgetPerUnit ? Number(form.maxBudgetPerUnit) : undefined,
        intendedApplication: form.intendedUse || undefined,
      };
      const res = await requirementsApi.create(payload);
      const reqId = res?.data?.data?.id || res?.data?.id || res?.id;
      if (reqId) navigate(`/matching/${reqId}`);
      else navigate('/dashboard');
    } catch (err) {
      if (err?.status === 400 && err?.data?.error?.details) {
        const details = err.data.error.details;
        if (Array.isArray(details)) {
          const fieldMap = {};
          details.forEach(d => {
            const field = d.field || (Array.isArray(d.path) ? d.path.join('.') : d.path || 'general');
            fieldMap[field] = d.message || 'Invalid field';
          });
          setFieldErrors(fieldMap);
          const firstMsg = Object.values(fieldMap)[0] || 'Request validation failed';
          setError(firstMsg);
        } else {
          setError(err.data.error?.message || 'Request validation failed');
        }
      } else {
        setError(err.message || 'Failed to create requirement');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2>Post CO₂ Requirement</h2>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>Tell us what you need, and we'll find matching suppliers</p>
        </div>
      </div>

      <div className="card post-req-card">
        <form onSubmit={handleSubmit} className="post-req-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-section">
            <h3 className="form-section-title">Quantity & Quality</h3>
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Quantity Required (Tonnes)</label>
                <input type="number" className="input" value={form.quantityRequired} onChange={handleChange('quantityRequired')} placeholder="e.g. 500" required min="1" step="any" />
              {fieldErrors.targetQuantity && <span className="field-error">{fieldErrors.targetQuantity}</span>}
              </div>
              <div className="input-group">
                <label className="input-label">Minimum Purity (%)</label>
                <input type="number" className="input" value={form.minPurity} onChange={handleChange('minPurity')} placeholder="e.g. 70" required min="1" max="100" step="any" />
              </div>
            </div>
          </div>

          <hr className="divider" />

          <div className="form-section">
            <h3 className="form-section-title">Delivery Location</h3>
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">City</label>
                <input className="input" value={form.deliveryCity} onChange={handleChange('deliveryCity')} placeholder="e.g. Ahmedabad" required />
              </div>
              <div className="input-group">
                <label className="input-label">State</label>
                <input className="input" value={form.deliveryState} onChange={handleChange('deliveryState')} placeholder="e.g. Gujarat" required />
              </div>
            </div>
          </div>

          <hr className="divider" />

          <div className="form-section">
            <h3 className="form-section-title">Optional Details</h3>
            <div className="form-row">
              <div className="input-group">
                <label className="input-label">Max Budget per Tonne (₹)</label>
                <input type="number" className="input" value={form.maxBudgetPerUnit} onChange={handleChange('maxBudgetPerUnit')} placeholder="e.g. 2500" step="any" />
              </div>
              <div className="input-group">
                <label className="input-label">Delivery By Date</label>
                <input
                  type="date"
                  className="input"
                  min={todayDateStr}
                  value={form.deliveryByDate}
                  onChange={handleChange('deliveryByDate')}
                />
                {(fieldErrors.deliveryByDate || fieldErrors.requiredDeliveryDate) && (
                  <span className="field-error">{fieldErrors.deliveryByDate || fieldErrors.requiredDeliveryDate}</span>
                )}
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Intended Use</label>
              <select className="input" value={form.intendedUse} onChange={handleChange('intendedUse')}>
                <option value="">Select intended use</option>
                <option value="SYNFUEL">Synthetic Fuels</option>
                <option value="CHEMICAL_FEEDSTOCK">Chemical Feedstock</option>
                <option value="CONSTRUCTION">Construction Material</option>
                <option value="FOOD_BEVERAGE">Food & Beverage</option>
                <option value="GREENHOUSE">Greenhouse Supply</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? 'Finding Matches...' : 'Find CO₂ Suppliers'}
              {!loading && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
