import { useEffect, useState } from 'react';
import { usersApi } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { formatStatus } from '../utils/formatters';

function safeDisplay(val) {
  if (val === null || val === undefined || val === '' || Number.isNaN(val)) return '—';
  if (typeof val === 'object') return '—';
  const str = String(val).trim();
  if (str === 'undefined' || str === 'null' || str === 'NaN' || str === '[object Object]') return '—';
  return str || '—';
}

export function Profile() {
  const { user: authUser, updateUser, fetchUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    companyName: '',
    companyLocation: '',
  });

  const syncFormFromData = (data) => {
    const userObj = data || authUser;
    const compObj = userObj?.company;
    setForm({
      fullName: userObj?.fullName || '',
      companyName: compObj?.name || '',
      companyLocation: compObj?.address || '',
    });
  };

  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      try {
        const res = await usersApi.getMe();
        const userData = res?.data || res;
        if (isMounted) {
          setProfile(userData);
          syncFormFromData(userData);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Unable to load profile.');
          syncFormFromData(authUser);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const currentData = profile || authUser;
  const currentCompany = currentData?.company || authUser?.company;

  const fullName = safeDisplay(currentData?.fullName);
  const email = safeDisplay(currentData?.email);
  const role = safeDisplay(currentData?.role);
  const companyName = safeDisplay(currentCompany?.name);
  const companyLocation = safeDisplay(currentCompany?.address);
  const accountStatus = 'Active';

  const memberSince = currentData?.createdAt
    ? new Date(currentData.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  const handleStartEdit = () => {
    setError('');
    setSuccess('');
    syncFormFromData(currentData);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setError('');
    syncFormFromData(currentData);
    setIsEditing(false);
  };

  const handleInputChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    setError('');
    setSuccess('');

    const trimmedFullName = form.fullName.trim();
    const trimmedCompanyName = form.companyName.trim();
    const trimmedLocation = form.companyLocation.trim();

    if (!trimmedFullName) {
      setError('Full Name is required and cannot be empty.');
      return;
    }
    if (!trimmedCompanyName) {
      setError('Company Name is required and cannot be empty.');
      return;
    }
    if (!trimmedLocation) {
      setError('Company Location is required and cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const res = await usersApi.updateMe({
        fullName: trimmedFullName,
        companyName: trimmedCompanyName,
        companyLocation: trimmedLocation,
      });
      const updatedUser = res?.data || res;
      setProfile(updatedUser);
      updateUser(updatedUser);
      if (typeof fetchUser === 'function') {
        fetchUser().catch(() => {});
      }
      setSuccess('Profile updated successfully.');
      setIsEditing(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update profile. Please try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter" style={{ maxWidth: '860px', margin: '0 auto', paddingBottom: 'var(--space-8)' }}>
      {/* Page Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div>
          <h2>Account Profile</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
            Manage your verified identity and organization credentials on CarbonBridge
          </p>
        </div>
        {!isEditing && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStartEdit}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Profile
          </button>
        )}
      </div>

      {/* Notifications */}
      {success && (
        <div
          className="badge-success"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-5)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            background: 'var(--color-accent-light, #e6f7ef)',
            color: 'var(--color-primary-dark, #065f46)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div
          className="auth-error"
          style={{
            marginBottom: 'var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="skeleton" style={{ height: '140px', borderRadius: 'var(--radius-lg)' }} />
          <div className="skeleton" style={{ height: '220px', borderRadius: 'var(--radius-lg)' }} />
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* User Hero Banner */}
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-5) var(--space-6)',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(5, 150, 105, 0.02) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.18)',
              borderRadius: 'var(--radius-lg)',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-xl)',
                  fontWeight: 700,
                  boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)',
                  flexShrink: 0,
                }}
              >
                {fullName !== '—' ? fullName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700 }}>
                  {fullName}
                </h3>
                <p style={{ margin: '2px 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                  {email}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
              <span
                className={`badge ${
                  role === 'SELLER' ? 'badge-primary' : role === 'BUYER' ? 'badge-info' : 'badge-neutral'
                }`}
                style={{ fontSize: 'var(--text-xs)', padding: '5px 12px', fontWeight: 600, letterSpacing: '0.05em' }}
              >
                {role}
              </span>
              <span
                className="badge badge-success"
                style={{ fontSize: 'var(--text-xs)', padding: '5px 12px', fontWeight: 600 }}
              >
                {accountStatus}
              </span>
            </div>
          </div>

          {/* Section 1: PROFILE */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
                borderBottom: '1px solid var(--color-border-light)',
              }}
            >
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
                PROFILE
              </h3>
              {isEditing && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Fields marked * are editable
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Full Name */}
              <div>
                <label className="input-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                  Full Name {isEditing && <span style={{ color: 'var(--color-danger)' }}>*</span>}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    className="input"
                    value={form.fullName}
                    onChange={handleInputChange('fullName')}
                    placeholder="e.g. John Doe"
                    disabled={saving}
                    required
                    style={{ maxWidth: '460px' }}
                  />
                ) : (
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {fullName}
                  </div>
                )}
              </div>

              {/* Email (Read-only) */}
              <div>
                <label className="input-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                  Email Address
                </label>
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', maxWidth: '460px' }}>
                    <input
                      type="email"
                      className="input"
                      value={email !== '—' ? email : ''}
                      disabled
                      style={{ background: 'var(--neutral-50, #f9fafb)', cursor: 'not-allowed', color: 'var(--color-text-secondary)' }}
                    />
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      (Read-only)
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>
                    {email}
                  </div>
                )}
              </div>

              {/* Role (Read-only) */}
              <div>
                <label className="input-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                  Role
                </label>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {formatStatus(role)}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: COMPANY */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
                borderBottom: '1px solid var(--color-border-light)',
              }}
            >
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
                COMPANY
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Company Name */}
              <div>
                <label className="input-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                  Company Name {isEditing && <span style={{ color: 'var(--color-danger)' }}>*</span>}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    className="input"
                    value={form.companyName}
                    onChange={handleInputChange('companyName')}
                    placeholder="e.g. Apex Industrial Systems"
                    disabled={saving}
                    required
                    style={{ maxWidth: '460px' }}
                  />
                ) : (
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {companyName}
                  </div>
                )}
              </div>

              {/* Company Location */}
              <div>
                <label className="input-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                  Company Location {isEditing && <span style={{ color: 'var(--color-danger)' }}>*</span>}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    className="input"
                    value={form.companyLocation}
                    onChange={handleInputChange('companyLocation')}
                    placeholder="e.g. Plot 42, GIDC Industrial Estate, Ankleshwar, Gujarat"
                    disabled={saving}
                    required
                    style={{ maxWidth: '560px' }}
                  />
                ) : (
                  <div style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                    {companyLocation}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: ACCOUNT */}
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
                borderBottom: '1px solid var(--color-border-light)',
              }}
            >
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
                ACCOUNT
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Account Status */}
              <div>
                <label className="input-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                  Account Status
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--color-success, #10b981)',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {accountStatus}
                  </span>
                </div>
              </div>

              {/* Member Since */}
              <div>
                <label className="input-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                  Member Since
                </label>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {memberSince}
                </div>
              </div>
            </div>
          </div>

          {/* Form Action Buttons in Edit Mode */}
          {isEditing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 'var(--space-3)',
                paddingTop: 'var(--space-4)',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                style={{ minWidth: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm" style={{ width: '14px', height: '14px' }} />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
