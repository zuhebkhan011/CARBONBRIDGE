import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

import { resolveLocationCoordinates } from '../utils/geo';

export function Register() {
  const [form, setForm] = useState({
    fullName: '', companyName: '', email: '', password: '',
    role: 'BUYER', city: '', state: '', registrationNumber: ''
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { register: registerUser, login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    setFieldErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setLoading(true);
    try {
      const locationInput = `${form.city}, ${form.state}`.trim();
      const resolved = resolveLocationCoordinates(locationInput);
      const companyType = form.role === 'SELLER' ? 'EMITTER' : 'OFFTAKER';
      await registerUser({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: form.role,
        company: {
          name: form.companyName,
          companyType,
          registrationNumber: form.registrationNumber || `CB-${Date.now().toString(36).toUpperCase()}`,
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          address: `${resolved.city}, ${resolved.state}`.trim() || form.city || 'Ahmedabad, Gujarat',
        },
      });
      await login(form.email, form.password);
      navigate(form.role === 'SELLER' ? '/seller/dashboard' : '/dashboard');
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
        setError(err.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-content">
          <div className="auth-logo">
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="white" fillOpacity="0.15"/>
              <path d="M16 6L22 12L16 18L10 12Z" fill="white" opacity="0.9"/>
              <path d="M16 14L22 20L16 26L10 20Z" fill="white" opacity="0.6"/>
            </svg>
          </div>
          <h1>CarbonBridge</h1>
          <p>Join the marketplace connecting industrial CO₂ emitters with utilization businesses.</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-wrapper">
          <div className="auth-form-header">
            <h2>Create Account</h2>
            <p>Start buying or selling captured CO₂</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="auth-error">{error}</div>}

            <div className="auth-role-toggle">
              <button type="button" className={`role-btn ${form.role === 'BUYER' ? 'active' : ''}`} onClick={() => setForm(p => ({...p, role: 'BUYER'}))}>
                I'm a Buyer
              </button>
              <button type="button" className={`role-btn ${form.role === 'SELLER' ? 'active' : ''}`} onClick={() => setForm(p => ({...p, role: 'SELLER'}))}>
                I'm a Seller
              </button>
            </div>

            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input className="input" value={form.fullName} onChange={handleChange('fullName')} placeholder="Your full name" required />
              {fieldErrors.fullName && <span className="field-error">{fieldErrors.fullName}</span>}
            </div>

            <div className="input-group">
              <label className="input-label">Company Name</label>
              <input className="input" value={form.companyName} onChange={handleChange('companyName')} placeholder="Company name" required />
              {fieldErrors['company.name'] && <span className="field-error">{fieldErrors['company.name']}</span>}
            </div>

            <div className="auth-row">
              <div className="input-group">
                <label className="input-label">City</label>
                <input className="input" value={form.city} onChange={handleChange('city')} placeholder="City" />
                {fieldErrors.city && <span className="field-error">{fieldErrors.city}</span>}
              </div>
              <div className="input-group">
                <label className="input-label">State</label>
                <input className="input" value={form.state} onChange={handleChange('state')} placeholder="State" />
                {fieldErrors.state && <span className="field-error">{fieldErrors.state}</span>}
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Email</label>
              <input type="email" className="input" value={form.email} onChange={handleChange('email')} placeholder="you@company.com" required />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input type="password" className="input" value={form.password} onChange={handleChange('password')} placeholder="Min. 8 characters" required minLength={8} />
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </div>

            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="auth-alt">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
