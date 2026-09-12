import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requirementsApi } from '../../api/requirements';
import { aiApi } from '../../api/ai';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import './PostRequirement.css';

const CITY_COORDS = {
  'Ahmedabad': { lat: 23.0225, lng: 72.5714 },
  'Rajkot': { lat: 22.3039, lng: 70.8022 },
  'Surat': { lat: 21.1702, lng: 72.8311 },
  'Vadodara': { lat: 22.3072, lng: 73.1812 },
  'Mumbai': { lat: 19.0760, lng: 72.8777 },
  'Pune': { lat: 18.5204, lng: 73.8567 },
  'Delhi': { lat: 28.6139, lng: 77.2090 },
  'Jaipur': { lat: 26.9124, lng: 75.7873 },
  'Chennai': { lat: 13.0827, lng: 80.2707 },
  'Bengaluru': { lat: 12.9716, lng: 77.5946 },
  'Bangalore': { lat: 12.9716, lng: 77.5946 },
  'Hyderabad': { lat: 17.3850, lng: 78.4867 },
  'Kolkata': { lat: 22.5726, lng: 88.3639 },
  'Indore': { lat: 22.7196, lng: 75.8577 },
  'Nagpur': { lat: 21.1458, lng: 79.0882 },
  'Bhopal': { lat: 23.2599, lng: 77.4126 },
  'Visakhapatnam': { lat: 17.6868, lng: 83.2185 },
  'Dahej': { lat: 21.7051, lng: 72.5841 },
  'Hazira': { lat: 21.1167, lng: 72.6500 },
  'Ankleshwar': { lat: 21.6264, lng: 73.0033 },
  'Jamnagar': { lat: 22.4707, lng: 70.0577 },
  'Gandhinagar': { lat: 23.2156, lng: 72.6369 },
};

const getCityCoords = (cityName) => {
  if (!cityName) return { lat: 20.5937, lng: 78.9629 };
  const trimmed = cityName.trim();
  const direct = CITY_COORDS[trimmed];
  if (direct) return direct;
  const match = Object.keys(CITY_COORDS).find(k => k.toLowerCase() === trimmed.toLowerCase());
  return match ? CITY_COORDS[match] : { lat: 20.5937, lng: 78.9629 };
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

  // AI Natural Language Requirement Parsing
  const [nlText, setNlText] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [nlMessage, setNlMessage] = useState('');

  // Web Speech recognition for voice-to-text requirement input
  const { isListening, micNotice, setMicNotice, toggleListening, stopListening } = useSpeechRecognition({
    onTranscript: (transcript) => {
      setNlText(transcript);
      setNlMessage('');
    },
    lang: 'en-IN',
    defaultErrorMessage: 'Could not recognize speech. You can type your requirement instead.',
  });

  const handleParseNl = async () => {
    if (!nlText.trim()) return;
    if (isListening) {
      stopListening();
    }
    setNlLoading(true);
    setNlMessage('');
    setMicNotice('');
    setError('');

    try {
      const res = await aiApi.parseRequirement(nlText);
      const parsed = res?.data || res;
      if (parsed) {
        const detectedCity = parsed.city || (parsed.location ? parsed.location.split(',')[0].trim() : '');
        const detectedState = parsed.state || (parsed.location && parsed.location.includes(',') ? parsed.location.split(',')[1].trim() : '');

        setForm(prev => ({
          ...prev,
          quantityRequired: parsed.quantityTonnes != null ? String(parsed.quantityTonnes) : prev.quantityRequired,
          minPurity: parsed.minimumPurity != null ? String(parsed.minimumPurity) : prev.minPurity,
          deliveryCity: detectedCity || prev.deliveryCity,
          deliveryState: detectedState || prev.deliveryState,
          maxBudgetPerUnit: parsed.maxPricePerTonne != null ? String(parsed.maxPricePerTonne) : prev.maxBudgetPerUnit,
          deliveryByDate: parsed.requiredDate || prev.deliveryByDate,
          intendedUse: parsed.intendedUse || prev.intendedUse,
        }));

        const filledFields = [];
        if (parsed.quantityTonnes) filledFields.push(`${parsed.quantityTonnes}T`);
        if (parsed.minimumPurity) filledFields.push(`${parsed.minimumPurity}% purity`);
        if (detectedCity) filledFields.push(detectedState ? `${detectedCity}, ${detectedState}` : detectedCity);
        if (parsed.maxPricePerTonne) filledFields.push(`₹${parsed.maxPricePerTonne}/T max`);
        if (parsed.requiredDate) filledFields.push(`by ${parsed.requiredDate}`);
        if (parsed.intendedUse) filledFields.push(parsed.intendedUse);

        setNlMessage(
          `✓ Parsed: ${filledFields.join(' • ')}. You can review and adjust any field below before submitting.`
        );
      }
    } catch (err) {
      setNlMessage('Could not parse natural language text automatically. Please fill the form manually.');
    } finally {
      setNlLoading(false);
    }
  };

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
      const coords = getCityCoords(city);
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
        {/* AI Natural Language Assistant */}
        <div
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(16, 185, 129, 0.04)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 'var(--radius-md, 8px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.04em' }}>
                AI REQUIREMENT ASSISTANT
              </span>
              <span className="badge" style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--color-primary)' }}>
                English • Hindi • Hinglish
              </span>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-2) 0' }}>
            Describe your CO₂ requirement in plain words, and our backend AI will automatically prefill the procurement form:
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <div className="cb-req-input-wrapper">
              <input
                type="text"
                className="input"
                style={{
                  width: '100%',
                  fontSize: '13px',
                  paddingRight: '38px',
                  borderColor: isListening ? '#10b981' : undefined,
                  boxShadow: isListening ? '0 0 0 2px rgba(16, 185, 129, 0.2)' : undefined,
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                value={nlText}
                onChange={(e) => {
                  setNlText(e.target.value);
                  if (micNotice) setMicNotice('');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleParseNl(); } }}
                placeholder={
                  isListening
                    ? '🎤 Listening... Speak your CO₂ requirement now'
                    : 'e.g., "Mujhe Ahmedabad mein 300 tonne 90%+ CO₂ chahiye, ₹2500/T ke andar, next month"'
                }
                disabled={nlLoading}
              />
              <button
                type="button"
                className={`cb-req-mic-btn ${isListening ? 'listening' : ''}`}
                onClick={toggleListening}
                disabled={nlLoading}
                aria-label="Use voice input"
                title={isListening ? 'Listening... Click to stop' : 'Speak your requirement'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleParseNl}
              disabled={nlLoading || !nlText.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {nlLoading ? 'Parsing...' : 'Parse with AI'}
            </button>
          </div>

          {/* Real-time speech recognition feedback / permission notice */}
          {isListening && (
            <div className="cb-req-mic-notice listening">
              <span className="cb-mic-pulse-dot" />
              <span>Listening... Speak your requirement in English, Hindi, or Hinglish (click mic or pause to finish)</span>
            </div>
          )}

          {micNotice && !isListening && (
            <div className="cb-req-mic-notice warning">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{micNotice}</span>
            </div>
          )}

          {nlMessage && !isListening && (
            <div
              style={{
                fontSize: '11px',
                marginTop: 'var(--space-2)',
                color: nlMessage.startsWith('✓') ? '#047857' : 'var(--color-text-secondary)',
                fontWeight: nlMessage.startsWith('✓') ? 600 : 400,
              }}
            >
              {nlMessage}
            </div>
          )}
        </div>

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
