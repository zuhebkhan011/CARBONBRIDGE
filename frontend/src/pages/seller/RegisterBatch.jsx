import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { batchesApi } from '../../api/batches';
import { useAuth } from '../../context/AuthContext';

export function RegisterBatch() {
  const navigate = useNavigate();
  const { user, logout, fetchUser } = useAuth();
  const [form, setForm] = useState({
    capturedQuantity: '',
    purity: '',
    captureMethod: '',
    storagePressure: '',
    storageTemp: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const lat = user?.company?.latitude != null ? Number(user.company.latitude) : undefined;
      const lng = user?.company?.longitude != null ? Number(user.company.longitude) : undefined;
      const year = new Date().getFullYear();
      const seq = Math.floor(100 + Math.random() * 900);
      const batchNumber = `CB-BATCH-${year}-${seq}`;
      await batchesApi.create({
        batchNumber,
        capturedQuantity: Number(form.capturedQuantity),
        purityPercentage: Number(form.purity),
        storagePressureBar: form.storagePressure ? Number(form.storagePressure) : 15,
        storageTemperatureC: form.storageTemp ? Number(form.storageTemp) : 25,
        ...(lat !== undefined ? { locationLat: lat } : {}),
        ...(lng !== undefined ? { locationLng: lng } : {}),
      });
      navigate('/seller/inventory');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes("Role 'BUYER'") || err.status === 403) {
        await fetchUser();
        setError("Your active browser session is signed in as a Buyer account. Batch registration requires a Seller account. Please log out and sign in with your Seller credentials.");
      } else {
        setError(msg || 'Failed to register batch');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-enter">
      <div className="page-header"><h2>Register CO₂ Batch</h2></div>
      <div className="card" style={{ maxWidth: '720px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {error && (
            <div className="auth-error" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div>{error}</div>
              {error.includes('Buyer account') && (
                <div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                    style={{ marginTop: 'var(--space-2)' }}
                  >
                    Log Out & Sign In with Seller Account
                  </button>
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Captured Quantity (Tonnes)</label>
              <input type="number" className="input" value={form.capturedQuantity} onChange={handleChange('capturedQuantity')} placeholder="e.g. 200" required min="1" step="any" />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Purity (%)</label>
              <input type="number" className="input" value={form.purity} onChange={handleChange('purity')} placeholder="e.g. 78" required min="1" max="100" step="any" />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Capture Method</label>
            <select className="input" value={form.captureMethod} onChange={handleChange('captureMethod')}>
              <option value="">Select method</option>
              <option value="POST_COMBUSTION">Post-Combustion</option>
              <option value="PRE_COMBUSTION">Pre-Combustion</option>
              <option value="OXY_FUEL">Oxy-Fuel</option>
              <option value="DIRECT_AIR">Direct Air Capture</option>
              <option value="INDUSTRIAL_PROCESS">Industrial Process</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Storage Pressure (bar)</label>
              <input type="number" className="input" value={form.storagePressure} onChange={handleChange('storagePressure')} placeholder="e.g. 15" step="any" />
            </div>
            <div className="input-group" style={{ flex: 1 }}>
              <label className="input-label">Storage Temperature (°C)</label>
              <input type="number" className="input" value={form.storageTemp} onChange={handleChange('storageTemp')} placeholder="e.g. -20" step="any" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border-light)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/seller/dashboard')}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Registering...' : 'Register Batch'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
