import { useEffect, useState } from 'react';
import { logisticsApi } from '../../api/logistics';

export function Logistics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await logisticsApi.getConsolidation();
        setData(res?.data || res);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="page-enter"><div className="skeleton" style={{ height: '300px' }} /></div>;

  return (
    <div className="page-enter">
      <div className="page-header"><h2>Route Consolidation</h2></div>

      {!data ? (
        <div className="card empty-state"><h3>No logistics data</h3><p>Consolidation analysis will appear once you have active shipments.</p></div>
      ) : (
        <>
          <div className="grid grid-4 dashboard-metrics" style={{ marginBottom: 'var(--space-8)' }}>
            <div className="metric-card">
              <div className="metric-label">Separate Distance</div>
              <div className="metric-value">{data.separateTotalKm || data.separate?.totalDistance || '—'} <span className="metric-sub">km</span></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Consolidated Distance</div>
              <div className="metric-value" style={{ color: 'var(--color-success)' }}>{data.consolidatedTotalKm || data.consolidated?.totalDistance || '—'} <span className="metric-sub">km</span></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Distance Saved</div>
              <div className="metric-value" style={{ color: 'var(--color-success)' }}>{data.savedKm || data.savings?.distance || '—'} <span className="metric-sub">km</span></div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Reduction</div>
              <div className="metric-value" style={{ color: 'var(--color-success)' }}>{data.reductionPct || data.savings?.percentage || '—'}%</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 'var(--space-6)', alignItems: 'center' }}>
            <div className="card" style={{ textAlign: 'center', borderColor: 'var(--color-error-border)' }}>
              <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)' }}>Separate Routes</h3>
              <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-text-muted)' }}>
                {data.separateRoutes || data.separate?.routes || 3}
              </div>
              <p style={{ fontSize: 'var(--text-sm)' }}>individual trips</p>
            </div>

            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-muted)' }}>VS</div>

            <div className="card" style={{ textAlign: 'center', borderColor: 'var(--color-success-border)' }}>
              <h3 style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)' }}>Consolidated Route</h3>
              <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: 'var(--color-success)' }}>1</div>
              <p style={{ fontSize: 'var(--text-sm)' }}>optimized trip</p>
            </div>
          </div>

          {data.routes && Array.isArray(data.routes) && (
            <div className="card" style={{ marginTop: 'var(--space-6)' }}>
              <div className="card-header"><h3>Route Details</h3></div>
              <table className="data-table">
                <thead><tr><th>From</th><th>To</th><th>Distance</th><th>Travel Time</th></tr></thead>
                <tbody>
                  {data.routes.map((r, i) => (
                    <tr key={i}>
                      <td>{r.from || r.origin}</td>
                      <td>{r.to || r.destination}</td>
                      <td>{r.distance || r.distanceKm} km</td>
                      <td>{r.travelTime || r.travelTimeHrs} hrs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
